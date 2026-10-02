import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { withCompanyLock } from '@shared/utils/company-lock.util';
import { errorMessage } from '@shared/utils/error.util';
import {
  Company,
  SubscriptionTier,
} from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';
import { BillingPrice } from './entities/billing-price.entity';
import {
  BillingPlan,
  BillingProvider,
  BILLING_PROVIDER,
  CreateSubscriptionInput,
  SubscriptionRef,
} from './provider/billing-provider.interface';
import {
  BILLING_CURRENCIES,
  isBillingCurrency,
  resolveBillingCurrency,
} from './billing-currency.util';

/** Call release() only if the caller's local write, made after reserveSeat, fails. */
export interface SeatReservation {
  subscriptionId: string;
  targetQuantity: number;
  /** Best-effort compensating call: sets quantity back to targetQuantity - 1. Never throws. */
  release(): Promise<void>;
}

export interface SubscriptionState {
  tier: SubscriptionTier;
  billingStatus: string | null;
  hasSubscription: boolean;
  purchasedSeats: number;
  activeUsers: number;
  /** Pinned billing currency for a subscribed company; the region-derived fallback otherwise. */
  currency: string;
  seatAmount: number | null;
  /** $250 base fee (minor units) for the first ENTERPRISE seat; null if unavailable in currency. */
  baseAmount: number | null;
  /** Per-currency seat prices for the checkout selector; empty once subscribed. */
  currencyOptions: { currency: string; seatAmount: number }[];
  canDowngradeToFree: boolean;
  /** True when the subscription is scheduled to cancel at period end (queued downgrade to FREE). */
  cancelAtPeriodEnd: boolean;
  /** ISO date the plan reverts to FREE (the paid-through / period-end date), or null. */
  cancelAt: string | null;
}

export interface CheckoutResult {
  checkoutUrl: string;
  /** Always null: subscriptionId arrives via webhook (single writer). */
  subscriptionId: null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(BillingPrice)
    private readonly priceRepo: Repository<BillingPrice>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /** Race-safe via company lock, re-read, provider idempotency key, and UNIQUE index as backstops. */
  async ensureCompanyCustomer(company: Company): Promise<string> {
    // Fast path: already resolved by the active provider, no lock needed.
    if (
      company.billingCustomerId &&
      company.billingProvider === this.provider.name
    )
      return company.billingCustomerId;

    return withCompanyLock(
      this.dataSource,
      company.id,
      async (manager: EntityManager) => {
        // Re-read under lock in case another writer set it since.
        const fresh = await manager.findOne(Company, {
          where: { id: company.id },
        });
        if (
          fresh?.billingCustomerId &&
          fresh.billingProvider === this.provider.name
        )
          return fresh.billingCustomerId;

        const customerId = await this.provider.ensureCustomer({
          companyId: company.id,
          companyName: company.name,
          email: await this.findBillingEmail(company.id),
          idempotencyKey: `ensure-customer:${company.id}`,
        });
        await manager.update(Company, company.id, {
          billingCustomerId: customerId,
          billingProvider: this.provider.name,
        });
        return customerId;
      },
    );
  }

  /** A price id minted by a previous provider does not count as synced. */
  isPriceSynced(row: BillingPrice): boolean {
    return !!row.providerPriceId && row.provider === this.provider.name;
  }

  /** True when syncPrices has work: an unsynced active row, or a deactivated override still on its base. */
  async needsPriceSync(): Promise<boolean> {
    const { rows, removedOverrides } = await this.loadPriceSyncRows();
    return rows.some(
      (r) =>
        !this.isPriceSynced(r) ||
        (!r.countryCodes &&
          this.removedOverridesOf(r, removedOverrides).length > 0),
    );
  }

  /** Active rows, plus deactivated overrides that may still ride on a base price. */
  private async loadPriceSyncRows(): Promise<{
    rows: BillingPrice[];
    removedOverrides: BillingPrice[];
  }> {
    const loaded = await this.priceRepo.find({
      where: [
        { active: true },
        {
          active: false,
          countryCodes: Not(IsNull()),
          providerPriceId: Not(IsNull()),
        },
      ],
    });
    return {
      rows: loaded.filter((r) => r.active),
      removedOverrides: loaded.filter((r) => !r.active),
    };
  }

  private removedOverridesOf(
    base: BillingPrice,
    removedOverrides: BillingPrice[],
  ): BillingPrice[] {
    return removedOverrides.filter(
      (r) =>
        r.kind === base.kind &&
        r.currency === base.currency &&
        !!base.providerPriceId &&
        r.providerPriceId === base.providerPriceId,
    );
  }

  /** Per-row failures persist, not throw, so one bad row doesn't abort the rest. */
  async syncPrices(): Promise<{
    synced: number;
    failed: number;
    total: number;
  }> {
    const { rows, removedOverrides } = await this.loadPriceSyncRows();
    const baseRows = rows.filter((r) => !r.countryCodes);
    const overridesOf = (base: BillingPrice) =>
      rows.filter(
        (r) =>
          r.countryCodes &&
          r.kind === base.kind &&
          r.currency === base.currency,
      );
    let synced = 0;
    let failed = 0;
    for (const row of baseRows) {
      const overrides = overridesOf(row);
      const removed = this.removedOverridesOf(row, removedOverrides);
      // A new, repointed or removed override re-creates the base price (create-and-supersede).
      const upToDate =
        this.isPriceSynced(row) &&
        removed.length === 0 &&
        overrides.every(
          (o) =>
            this.isPriceSynced(o) && o.providerPriceId === row.providerPriceId,
        );
      if (upToDate) continue;
      const group = [row, ...overrides];
      const groupIds = group.map((m) => m.id);
      const duplicates = this.duplicateCountries(overrides);
      if (duplicates.length) {
        const message = `Countries ${duplicates.join(', ')} appear in more than one active ${row.kind} ${row.currency} override`;
        this.logger.error(
          `Price sync skipped for ${row.kind}/${row.currency}: ${message}`,
        );
        await this.priceRepo.update(
          { id: In(groupIds) },
          { lastSyncError: message, lastSyncErrorAt: new Date() },
        );
        failed += group.length;
        continue;
      }
      const previousPriceId = this.isPriceSynced(row)
        ? row.providerPriceId
        : null;
      try {
        const priceId = await this.provider.ensurePrice(
          row.kind,
          row.currency,
          row.unitAmount,
          overrides.map((o) => ({
            countryCodes: o.countryCodes as string[],
            currency: o.currency,
            unitAmount: o.unitAmount,
          })),
        );
        await this.priceRepo.update(
          { id: In(groupIds) },
          {
            provider: this.provider.name,
            providerPriceId: priceId,
            lastSyncError: null,
            lastSyncErrorAt: null,
          },
        );
        synced += group.length;
        if (removed.length) {
          await this.priceRepo.update(
            { id: In(removed.map((r) => r.id)) },
            { providerPriceId: null },
          );
        }
        if (previousPriceId && previousPriceId !== priceId) {
          await this.archiveSupersededPrice(previousPriceId);
        }
      } catch (err) {
        const message = errorMessage(err);
        this.logger.error(
          `Price sync failed for ${row.kind}/${row.currency}: ${message}`,
        );
        await this.priceRepo.update(
          { id: In(groupIds) },
          { lastSyncError: message, lastSyncErrorAt: new Date() },
        );
        failed += group.length;
      }
    }
    for (const orphan of rows.filter(
      (r) =>
        r.countryCodes &&
        !this.isPriceSynced(r) &&
        !baseRows.some((b) => b.kind === r.kind && b.currency === r.currency),
    )) {
      await this.priceRepo.update(orphan.id, {
        lastSyncError: `No active base ${orphan.kind} price in ${orphan.currency} to carry this override`,
        lastSyncErrorAt: new Date(),
      });
      failed++;
    }
    return { synced, failed, total: rows.length };
  }

  /** Upper-cased countries listed by more than one override; the provider rejects a repeat. */
  private duplicateCountries(overrides: BillingPrice[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const o of overrides) {
      for (const code of new Set(
        (o.countryCodes ?? []).map((c) => c.toUpperCase()),
      )) {
        if (seen.has(code)) duplicates.add(code);
        seen.add(code);
      }
    }
    return [...duplicates].sort();
  }

  /** Non-fatal: rows already point at the new price. */
  private async archiveSupersededPrice(priceId: string): Promise<void> {
    try {
      await this.provider.archivePrice(priceId);
    } catch (err) {
      this.logger.warn(
        `Could not archive superseded price ${priceId}: ${errorMessage(err)}`,
      );
    }
  }

  async getSubscriptionState(companyId: string): Promise<SubscriptionState> {
    const company = await this.findCompany(companyId);
    const currency = this.effectiveBillingCurrency(company);
    const hasSubscription = !!company.billingSubscriptionId;
    const [seatPrice, basePrice, seatPrices, activeUsers] = await Promise.all([
      this.priceRepo.findOne({
        where: { kind: 'SEAT', currency, active: true, countryCodes: IsNull() },
      }),
      this.priceRepo.findOne({
        where: {
          kind: 'ENTERPRISE_BASE',
          currency,
          active: true,
          countryCodes: IsNull(),
        },
      }),
      // Selector options are only needed before the currency is locked.
      hasSubscription
        ? Promise.resolve<BillingPrice[]>([])
        : this.priceRepo.find({
            where: { kind: 'SEAT', active: true, countryCodes: IsNull() },
          }),
      this.countActiveUsers(companyId),
    ]);
    const seatByCurrency = new Map(
      (seatPrices ?? []).map((p) => [p.currency, p.unitAmount]),
    );
    const currencyOptions = BILLING_CURRENCIES.flatMap((c) => {
      const amount = seatByCurrency.get(c);
      return amount != null ? [{ currency: c, seatAmount: amount }] : [];
    });
    // Not mirrored on Company; ask the provider live.
    let cancelAtPeriodEnd = false;
    let cancelAt: string | null = null;
    if (company.billingSubscriptionId && company.billingCustomerId) {
      try {
        const schedule = await this.provider.getCancellationState({
          subscriptionId: company.billingSubscriptionId,
          customerId: company.billingCustomerId,
        });
        cancelAtPeriodEnd = schedule.cancelAtPeriodEnd;
        cancelAt = schedule.cancelAt ? schedule.cancelAt.toISOString() : null;
      } catch (err) {
        this.logger.warn(
          `Could not read cancellation state for company ${companyId}: ` +
            `${errorMessage(err)}`,
        );
      }
    }
    return {
      tier: company.subscriptionTier,
      billingStatus: company.billingStatus ?? null,
      hasSubscription,
      purchasedSeats: company.purchasedSeats,
      activeUsers,
      currency,
      seatAmount: seatPrice?.unitAmount ?? null,
      baseAmount: basePrice?.unitAmount ?? null,
      currencyOptions,
      canDowngradeToFree: activeUsers <= 1,
      cancelAtPeriodEnd,
      cancelAt,
    };
  }

  /** ENTERPRISE is gated in the controller; subscriptionId is null here, it arrives via webhook. */
  async startCheckout(
    companyId: string,
    successUrl: string,
    cancelUrl: string,
    currencyChoice?: string,
  ): Promise<CheckoutResult> {
    const company = await this.findCompany(companyId);
    if (company.billingSubscriptionId) {
      throw new ConflictException(
        'This company already has an active subscription.',
      );
    }
    // FREE to PRO only; blocks a comped company opening a checkout the webhook would then re-tier.
    if (company.subscriptionTier !== SubscriptionTier.FREE) {
      throw new ConflictException(
        'Checkout is only available for companies on the FREE plan.',
      );
    }
    this.assertAllowedRedirectUrl(successUrl, 'successUrl');
    this.assertAllowedRedirectUrl(cancelUrl, 'cancelUrl');
    // User-selected currency (default USD), validated before any side effect.
    const currency = this.normalizeCheckoutCurrency(currencyChoice);
    const customerId = await this.ensureCompanyCustomer(company);
    // PRO: pure per-seat, no base. Solo PRO = 1 seat.
    const quantity = Math.max(await this.countActiveUsers(companyId), 1);

    const seatPriceId = await this.getProviderPriceId('SEAT', currency);

    return this.createProviderCheckout({
      customerId,
      seatPriceId,
      basePriceId: null,
      plan: 'PRO',
      quantity,
      successUrl,
      cancelUrl,
      companyId,
    });
  }

  /** ENTERPRISE requires basePriceId; PRO does not. */
  async adminStartCheckout(
    companyId: string,
    plan: BillingPlan,
    quantity: number,
    successUrl: string,
    cancelUrl: string,
    currencyChoice?: string,
  ): Promise<CheckoutResult> {
    const company = await this.findCompany(companyId);
    if (company.billingSubscriptionId) {
      throw new ConflictException(
        'Company already has a subscription. Use admin/change-plan to switch plans.',
      );
    }
    this.assertAllowedRedirectUrl(successUrl, 'successUrl');
    this.assertAllowedRedirectUrl(cancelUrl, 'cancelUrl');
    // Admin-picked currency (default USD), validated before any side effect.
    const currency = this.normalizeCheckoutCurrency(currencyChoice);
    const customerId = await this.ensureCompanyCustomer(company);

    const seatPriceId = await this.getProviderPriceId('SEAT', currency);
    // ENTERPRISE base covers seat 1, so SEAT units = quantity - 1; PRO bills every seat.
    const basePriceId =
      plan === 'ENTERPRISE'
        ? await this.getProviderPriceId('ENTERPRISE_BASE', currency)
        : null;
    const seatUnits =
      plan === 'ENTERPRISE' ? Math.max(quantity - 1, 0) : quantity;

    return this.createProviderCheckout({
      customerId,
      seatPriceId,
      basePriceId,
      plan,
      quantity: seatUnits,
      successUrl,
      cancelUrl,
      companyId,
    });
  }

  private async createProviderCheckout(
    input: CreateSubscriptionInput,
  ): Promise<CheckoutResult> {
    try {
      return await this.provider.createSubscription(input);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const msg = errorMessage(err);
      this.logger.error(
        `Checkout provider call failed for company ${input.companyId}: ${msg}`,
      );
      throw new BadGatewayException(
        `The payment provider rejected the checkout: ${msg}`,
      );
    }
  }

  /** Uses the LIVE provider quantity, not company.purchasedSeats, which is a stale read model. */
  async changePlanForCompany(
    companyId: string,
    plan: BillingPlan,
  ): Promise<void> {
    const company = await this.findCompany(companyId);
    if (!company.billingSubscriptionId || !company.billingCustomerId) {
      throw new BadRequestException(
        'Company does not have an active subscription',
      );
    }
    // Currency is fixed at checkout and pinned; a plan switch keeps it.
    const currency = this.effectiveBillingCurrency(company);
    const seatPriceId = await this.getProviderPriceId('SEAT', currency);
    const basePriceId =
      plan === 'ENTERPRISE'
        ? await this.getProviderPriceId('ENTERPRISE_BASE', currency)
        : null;

    await this.provider.changePlan({
      subscriptionId: company.billingSubscriptionId,
      customerId: company.billingCustomerId,
      plan,
      seatPriceId,
      basePriceId,
    });
  }

  /** Blocked 409 if more than 1 active user; trim to 1 first. */
  async cancelSubscription(companyId: string): Promise<void> {
    const company = await this.findCompany(companyId);
    if (!company.billingSubscriptionId || !company.billingCustomerId) {
      throw new BadRequestException(
        'Company does not have an active subscription to cancel',
      );
    }

    const activeUsers = await this.countActiveUsers(companyId);
    if (activeUsers > 1) {
      throw new ConflictException(
        `Cannot cancel: company has ${activeUsers} active users. ` +
          `Remove or deactivate all but 1 before downgrading to FREE.`,
      );
    }

    await this.provider.cancel({
      subscriptionId: company.billingSubscriptionId,
      customerId: company.billingCustomerId,
    });
  }

  /** Clears cancel_at_period_end so the subscription keeps renewing and the plan stays. */
  async resumeSubscription(companyId: string): Promise<void> {
    const company = await this.findCompany(companyId);
    if (!company.billingSubscriptionId || !company.billingCustomerId) {
      throw new BadRequestException(
        'Company does not have an active subscription to resume',
      );
    }
    await this.provider.resume({
      subscriptionId: company.billingSubscriptionId,
      customerId: company.billingCustomerId,
    });
  }

  // Derives target from LIVE provider quantity, not purchasedSeats; run inside withCompanyLock.

  /** FREE/comp-without-subscription returns null; paid+subscribed does live+1, 402 on rejection. */
  async reserveSeat(company: Company): Promise<SeatReservation | null> {
    const ctx = this.seatContext(company);
    if (!ctx) return null;
    const { ref } = ctx;

    const seatPriceId = await this.resolveSeatPriceId(company);
    const liveQuantity = await this.readLiveSeatQuantity(ref, company.id);
    const targetQuantity = liveQuantity + 1;

    try {
      await this.provider.updateSeatQuantity(ref, targetQuantity, seatPriceId);
    } catch (err) {
      this.logger.error(
        `Seat increment rejected by billing provider for company ${company.id} ` +
          `(subscription ${ref.subscriptionId}, target ${targetQuantity}): ` +
          `${errorMessage(err)}`,
      );
      throw new HttpException(
        {
          message:
            'The billing provider rejected the seat change. No user was created. ' +
            'Check the payment method on file and try again.',
          error: 'Payment Required',
          statusCode: HttpStatus.PAYMENT_REQUIRED,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return {
      subscriptionId: ref.subscriptionId,
      targetQuantity,
      // Restore the pre-increment value; safe under the caller's company lock.
      release: async (): Promise<void> => {
        await this.compensateSeat(ref, liveQuantity, company.id, seatPriceId);
      },
    };
  }

  /** Must run inside withCompanyLock; returns a compensator, or null if no provider call made. */
  async decrementSeat(
    company: Company,
  ): Promise<{ compensate: () => Promise<void> } | null> {
    const ctx = this.seatContext(company);
    if (!ctx) return null;
    const { ref } = ctx;

    const seatPriceId = await this.resolveSeatPriceId(company);
    const liveQuantity = await this.readLiveSeatQuantity(ref, company.id);
    // ENTERPRISE seat line = extra seats, floors at 0; PRO floors at 1 (owner).
    const floor =
      company.subscriptionTier === SubscriptionTier.ENTERPRISE ? 0 : 1;
    const targetQuantity = Math.max(liveQuantity - 1, floor);
    await this.callSeatUpdate(ref, targetQuantity, company.id, seatPriceId);

    return {
      compensate: async () => {
        await this.compensateSeat(ref, liveQuantity, company.id, seatPriceId);
      },
    };
  }

  /** Must run inside withCompanyLock. HTTP 402 if paid tier with no live subscription. */
  async getLiveSeatQuantity(company: Company): Promise<number> {
    if (!company.billingSubscriptionId || !company.billingCustomerId) {
      throw new HttpException(
        'This company has a paid plan but no active subscription. Complete checkout first.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const ref = {
      subscriptionId: company.billingSubscriptionId,
      customerId: company.billingCustomerId,
    };
    return this.readLiveSeatQuantity(ref, company.id);
  }

  /** Must run inside withCompanyLock. Does not write purchasedSeats; the webhook does. */
  async setSeatQuantity(
    company: Company,
    quantity: number,
  ): Promise<SubscriptionRef> {
    if (!company.billingSubscriptionId || !company.billingCustomerId) {
      throw new HttpException(
        'This company has a paid plan but no active subscription. Complete checkout first.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const ref = {
      subscriptionId: company.billingSubscriptionId,
      customerId: company.billingCustomerId,
    };
    const seatPriceId = await this.resolveSeatPriceId(company);
    await this.provider.updateSeatQuantity(ref, quantity, seatPriceId);
    return ref;
  }

  /** Null for FREE and for a paid comp account with no subscription. */
  private seatContext(company: Company): { ref: SubscriptionRef } | null {
    if (company.subscriptionTier === SubscriptionTier.FREE) return null;
    const subscriptionId = company.billingSubscriptionId;
    const customerId = company.billingCustomerId;
    if (!subscriptionId || !customerId) return null;
    return { ref: { subscriptionId, customerId } };
  }

  /** Required to create the seat line the first time a solo ENTERPRISE adds an extra seat. */
  private async resolveSeatPriceId(company: Company): Promise<string> {
    return this.getProviderPriceId(
      'SEAT',
      this.effectiveBillingCurrency(company),
    );
  }

  /** Pinned billing currency, or the region-derived fallback when none is pinned. */
  private effectiveBillingCurrency(company: Company): string {
    return (
      company.billingCurrency ??
      resolveBillingCurrency(company.defaultRegionCode)
    );
  }

  /** Validate the selected currency; default USD, 400 on an unsupported value. */
  private normalizeCheckoutCurrency(currencyChoice?: string): string {
    if (currencyChoice == null) return 'usd';
    const currency = currencyChoice.toLowerCase();
    if (!isBillingCurrency(currency)) {
      throw new BadRequestException(
        `Unsupported payment currency "${currencyChoice}". ` +
          `Choose one of: ${BILLING_CURRENCIES.join(', ')}.`,
      );
    }
    return currency;
  }

  private async readLiveSeatQuantity(
    ref: SubscriptionRef,
    companyId: string,
  ): Promise<number> {
    try {
      return await this.provider.getSeatQuantity(ref);
    } catch (err) {
      this.logger.error(
        `Failed to read live seat quantity for company ${companyId} ` +
          `(subscription ${ref.subscriptionId}): ${errorMessage(err)}`,
      );
      throw new HttpException(
        {
          message:
            'The billing provider is unavailable and the seat change could not be verified. ' +
            'No user was changed. Please try again.',
          error: 'Payment Required',
          statusCode: HttpStatus.PAYMENT_REQUIRED,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** Set the seat quantity, surfacing a provider rejection as HTTP 402. */
  private async callSeatUpdate(
    ref: SubscriptionRef,
    quantity: number,
    companyId: string,
    seatPriceId?: string,
  ): Promise<void> {
    try {
      await this.provider.updateSeatQuantity(ref, quantity, seatPriceId);
    } catch (err) {
      this.logger.error(
        `Seat update to ${quantity} rejected by billing provider for company ${companyId} ` +
          `(subscription ${ref.subscriptionId}): ${errorMessage(err)}`,
      );
      throw new HttpException(
        `The billing provider rejected the seat change: ${errorMessage(err)}`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** Best-effort restore of a captured seat quantity. Never throws. */
  private async compensateSeat(
    ref: SubscriptionRef,
    quantity: number,
    companyId: string,
    seatPriceId?: string,
  ): Promise<void> {
    try {
      await this.provider.updateSeatQuantity(ref, quantity, seatPriceId);
    } catch (rollbackErr) {
      this.logger.error(
        `Compensating seat rollback FAILED for company ${companyId} ` +
          `(subscription ${ref.subscriptionId}, quantity ${quantity}): ` +
          `${errorMessage(rollbackErr)}. ` +
          `Reconcile manually against the provider dashboard.`,
      );
    }
  }

  // Thin by design: provider port stays confined to billing module; console never holds the token.

  /** Refund a past card payment (partial: amountMinor, full: null). */
  async refundCardPayment(
    invoiceId: string,
    amountMinor: number | null,
  ): Promise<{ refundId: string }> {
    return this.provider.refundInvoicePayment(invoiceId, amountMinor);
  }

  /** Reduce the customer's NEXT invoice by amountMinor (default remedy). */
  async creditNextBill(
    customerId: string,
    amountMinor: number,
    currency: string,
  ): Promise<{ creditId: string }> {
    return this.provider.creditCustomerBalance(
      customerId,
      amountMinor,
      currency,
    );
  }

  private async findCompany(companyId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException(`Company ${companyId} not found`);
    return company;
  }

  /** Allowed redirect origins for hosted-checkout return URLs (same source as CORS). */
  private getAllowedOrigins(): string[] {
    const raw = this.config.get<string>('CORS_ORIGIN');
    const origins = raw
      ? raw
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : ['http://localhost:4200'];
    return origins.map((o) => o.replace(/\/+$/, ''));
  }

  /** Guards against open-redirect: client URL must be http(s) on an allowed origin. */
  private assertAllowedRedirectUrl(url: string, field: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`${field} must be an absolute http(s) URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(`${field} must be an http(s) URL`);
    }
    if (!this.getAllowedOrigins().includes(parsed.origin)) {
      throw new BadRequestException(
        `${field} is not an allowed redirect origin`,
      );
    }
  }

  private async findBillingEmail(companyId: string): Promise<string | null> {
    const admin = await this.userRepo.findOne({
      where: { companyId, role: Role.COMPANY_ADMIN, isActive: true },
      select: ['email'],
      order: { createdAt: 'ASC' },
    });
    return admin?.email ?? null;
  }

  private async countActiveUsers(companyId: string): Promise<number> {
    return this.userRepo.count({ where: { companyId, isActive: true } });
  }

  /** Throws if not found or not yet synced to the active provider. */
  private async getProviderPriceId(
    kind: 'SEAT' | 'ENTERPRISE_BASE',
    currency: string,
  ): Promise<string> {
    const row = await this.priceRepo.findOne({
      where: { kind, currency, active: true, countryCodes: IsNull() },
    });
    if (!row) {
      throw new BadRequestException(
        `No active ${kind} price found for currency ${currency}. ` +
          `Run POST /billing/prices/sync first.`,
      );
    }
    if (!this.isPriceSynced(row) || !row.providerPriceId) {
      throw new BadRequestException(
        `${kind} price for ${currency} has not been synced to the billing provider yet. ` +
          `Run POST /billing/prices/sync first.`,
      );
    }
    return row.providerPriceId;
  }
}
