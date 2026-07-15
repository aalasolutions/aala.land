import {
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
import { DataSource, EntityManager, Repository } from 'typeorm';
import { withCompanyLock } from '@shared/utils/company-lock.util';
import {
    Company,
    SubscriptionTier,
} from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { BillingPrice } from './entities/billing-price.entity';
import {
    BillingPlan,
    BillingProvider,
    BILLING_PROVIDER,
    SubscriptionRef,
} from './provider/billing-provider.interface';
import { resolveBillingCurrency } from './billing-currency.util';

/**
 * Handle returned by reserveSeat for a successful provider-side seat increment.
 * The caller performs its local write and calls release() ONLY if that write fails.
 */
export interface SeatReservation {
    subscriptionId: string;
    targetQuantity: number;
    /** Best-effort compensating call: sets quantity back to targetQuantity - 1. Never throws. */
    release(): Promise<void>;
}

/** Shape returned by getSubscriptionState. */
export interface SubscriptionState {
    tier: SubscriptionTier;
    billingStatus: string | null;
    hasSubscription: boolean;
    purchasedSeats: number;
    activeUsers: number;
    currency: string;
    seatAmount: number | null;
    /** The $250 base-fee amount (minor units) that covers the first ENTERPRISE seat; null if none for the currency. */
    baseAmount: number | null;
    canDowngradeToFree: boolean;
    /** True when the subscription is scheduled to cancel at period end (a queued downgrade to FREE). */
    cancelAtPeriodEnd: boolean;
    /** ISO date the plan reverts to FREE (the paid-through / period-end date), or null. */
    cancelAt: string | null;
}

/** Shape returned by startCheckout / adminCheckout. */
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

    // -------------------------------------------------------------------------
    // Unit 1 methods (unchanged)
    // -------------------------------------------------------------------------

    /**
     * Idempotent get-or-create. Race-safe (audit P5): serialized behind the
     * company lock with a re-read inside it, plus Stripe idempotency key and
     * a UNIQUE index on billing_customer_id as backstops.
     */
    async ensureCompanyCustomer(company: Company): Promise<string> {
        // Fast path: already resolved, no lock needed.
        if (company.billingCustomerId) return company.billingCustomerId;

        return withCompanyLock(
            this.dataSource,
            company.id,
            async (manager: EntityManager) => {
                // Re-read under lock in case another writer set it since.
                const fresh = await manager.findOne(Company, {
                    where: { id: company.id },
                });
                if (fresh?.billingCustomerId) return fresh.billingCustomerId;

                const customerId = await this.provider.ensureCustomer({
                    companyId: company.id,
                    companyName: company.name,
                    idempotencyKey: `ensure-customer:${company.id}`,
                });
                await manager.update(Company, company.id, {
                    billingCustomerId: customerId,
                    billingProvider: 'stripe',
                });
                return customerId;
            },
        );
    }

    /** Creates the provider Price for any active row that has no provider_price_id yet. */
    async syncPrices(): Promise<{ synced: number; total: number }> {
        const rows = await this.priceRepo.find({ where: { active: true } });
        let synced = 0;
        for (const row of rows) {
            if (row.providerPriceId) continue;
            const priceId = await this.provider.ensurePrice(
                row.kind,
                row.currency,
                row.unitAmount,
            );
            await this.priceRepo.update(row.id, { providerPriceId: priceId });
            synced++;
        }
        return { synced, total: rows.length };
    }

    // -------------------------------------------------------------------------
    // Unit 3 methods (subscription lifecycle)
    // -------------------------------------------------------------------------

    /** Return the current billing-relevant snapshot for a company. */
    async getSubscriptionState(companyId: string): Promise<SubscriptionState> {
        const company = await this.findCompany(companyId);
        const currency = resolveBillingCurrency(company.defaultRegionCode);
        const [seatPrice, basePrice, activeUsers] = await Promise.all([
            this.priceRepo.findOne({
                where: { kind: 'SEAT', currency, active: true },
            }),
            this.priceRepo.findOne({
                where: { kind: 'ENTERPRISE_BASE', currency, active: true },
            }),
            this.countActiveUsers(companyId),
        ]);
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
                cancelAt = schedule.cancelAt
                    ? schedule.cancelAt.toISOString()
                    : null;
            } catch (err) {
                this.logger.warn(
                    `Could not read cancellation state for company ${companyId}: ` +
                        `${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
        return {
            tier: company.subscriptionTier,
            billingStatus: company.billingStatus ?? null,
            hasSubscription: !!company.billingSubscriptionId,
            purchasedSeats: company.purchasedSeats,
            activeUsers,
            currency,
            seatAmount: seatPrice?.unitAmount ?? null,
            baseAmount: basePrice?.unitAmount ?? null,
            canDowngradeToFree: activeUsers <= 1,
            cancelAtPeriodEnd,
            cancelAt,
        };
    }

    /**
     * Open a hosted Checkout session for PRO (self-serve, COMPANY_ADMIN).
     * ENTERPRISE is SUPER_ADMIN only, gated in the controller. subscriptionId
     * is null here; it arrives via the webhook.
     */
    async startCheckout(
        companyId: string,
        successUrl: string,
        cancelUrl: string,
    ): Promise<CheckoutResult> {
        const company = await this.findCompany(companyId);
        if (company.billingSubscriptionId) {
            throw new ConflictException(
                'This company already has an active subscription.',
            );
        }
        // FREE -> PRO only; blocks a comped company from opening a checkout
        // the webhook would then re-tier.
        if (company.subscriptionTier !== SubscriptionTier.FREE) {
            throw new ConflictException(
                'Checkout is only available for companies on the FREE plan.',
            );
        }
        this.assertAllowedRedirectUrl(successUrl, 'successUrl');
        this.assertAllowedRedirectUrl(cancelUrl, 'cancelUrl');
        const customerId = await this.ensureCompanyCustomer(company);
        const currency = resolveBillingCurrency(company.defaultRegionCode);
        // PRO: pure per-seat, no base. Solo PRO = 1 seat.
        const quantity = Math.max(await this.countActiveUsers(companyId), 1);

        const seatPriceId = await this.getProviderPriceId('SEAT', currency);

        const result = await this.provider.createSubscription({
            customerId,
            seatPriceId,
            basePriceId: null,
            plan: 'PRO',
            quantity,
            successUrl,
            cancelUrl,
            companyId,
        });
        return result;
    }

    /**
     * Open a hosted Checkout session for any plan (SUPER_ADMIN only).
     * ENTERPRISE requires basePriceId; PRO does not.
     */
    async adminStartCheckout(
        companyId: string,
        plan: BillingPlan,
        quantity: number,
        successUrl: string,
        cancelUrl: string,
    ): Promise<CheckoutResult> {
        const company = await this.findCompany(companyId);
        if (company.billingSubscriptionId) {
            throw new ConflictException(
                'Company already has a subscription. Use admin/change-plan to switch plans.',
            );
        }
        this.assertAllowedRedirectUrl(successUrl, 'successUrl');
        this.assertAllowedRedirectUrl(cancelUrl, 'cancelUrl');
        const customerId = await this.ensureCompanyCustomer(company);
        const currency = resolveBillingCurrency(company.defaultRegionCode);

        const seatPriceId = await this.getProviderPriceId('SEAT', currency);
        // ENTERPRISE base covers seat 1, so SEAT units = quantity - 1; PRO bills every seat.
        const basePriceId =
            plan === 'ENTERPRISE'
                ? await this.getProviderPriceId('ENTERPRISE_BASE', currency)
                : null;
        const seatUnits =
            plan === 'ENTERPRISE' ? Math.max(quantity - 1, 0) : quantity;

        const result = await this.provider.createSubscription({
            customerId,
            seatPriceId,
            basePriceId,
            plan,
            quantity: seatUnits,
            successUrl,
            cancelUrl,
            companyId,
        });
        return result;
    }

    /**
     * Change plan (PRO <-> ENTERPRISE). SUPER_ADMIN only. Provider carries over
     * the LIVE subscription quantity, not company.purchasedSeats (stale read model).
     */
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
        const currency = resolveBillingCurrency(company.defaultRegionCode);
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

    /**
     * Cancel at period end (COMPANY_ADMIN or SUPER_ADMIN). Blocked 409 if more
     * than 1 active user; trim to 1 first.
     */
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

    /**
     * Undo a queued downgrade (COMPANY_ADMIN): clears cancel_at_period_end so the
     * subscription keeps renewing and the plan stays.
     */
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

    // -------------------------------------------------------------------------
    // Unit 4 methods (seat lifecycle)
    //
    // Race audit P1: every mutation derives its target from the LIVE provider
    // quantity, never Company.purchasedSeats (lags, webhook-synced). Callers
    // MUST run inside withCompanyLock to serialize read->set->write per company.
    // These methods write NO Company column; the webhook is the single writer
    // of purchasedSeats/billingStatus/billingSubscriptionId.
    // -------------------------------------------------------------------------

    /**
     * Reserve one seat with the provider before the local user write.
     * FREE or comp-without-subscription (Option B, owner decision): no provider
     * call, returns null. Paid + subscribed: live + 1, HTTP 402 on rejection.
     */
    async reserveSeat(company: Company): Promise<SeatReservation | null> {
        const ctx = this.seatContext(company);
        if (!ctx) return null;
        const { ref } = ctx;

        const seatPriceId = await this.resolveSeatPriceId(company);
        const liveQuantity = await this.readLiveSeatQuantity(ref, company.id);
        const targetQuantity = liveQuantity + 1;

        try {
            await this.provider.updateSeatQuantity(
                ref,
                targetQuantity,
                seatPriceId,
            );
        } catch (err) {
            this.logger.error(
                `Seat increment rejected by billing provider for company ${company.id} ` +
                    `(subscription ${ref.subscriptionId}, target ${targetQuantity}): ` +
                    `${err instanceof Error ? err.message : String(err)}`,
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
                await this.compensateSeat(
                    ref,
                    liveQuantity,
                    company.id,
                    seatPriceId,
                );
            },
        };
    }

    /**
     * Decrement seat quantity by one on user removal. MUST run inside
     * withCompanyLock. Returns a compensator, or null if no provider call
     * was made (FREE / comp without subscription, Option B).
     */
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
                await this.compensateSeat(
                    ref,
                    liveQuantity,
                    company.id,
                    seatPriceId,
                );
            },
        };
    }

    /**
     * Live seat quantity for compensation baselines before an absolute
     * setSeatQuantity. MUST run inside withCompanyLock. HTTP 402 if paid tier
     * with no live subscription.
     */
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

    /**
     * Sets an absolute seat quantity (e.g. trim-to-one). MUST run inside
     * withCompanyLock. Does not write purchasedSeats; the webhook does.
     * HTTP 402 if paid tier with no live subscription.
     */
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

    /**
     * Resolves the subscription ref when the company actually bills per seat.
     * Null for FREE and for a paid comp account with no subscription (Option B).
     */
    private seatContext(company: Company): { ref: SubscriptionRef } | null {
        if (company.subscriptionTier === SubscriptionTier.FREE) return null;
        const subscriptionId = company.billingSubscriptionId;
        const customerId = company.billingCustomerId;
        if (!subscriptionId || !customerId) return null;
        return { ref: { subscriptionId, customerId } };
    }

    /**
     * The SEAT ($25) provider price id for a company's billing currency. Required to
     * create the seat line the first time a solo ENTERPRISE adds an extra seat.
     */
    private async resolveSeatPriceId(company: Company): Promise<string> {
        return this.getProviderPriceId(
            'SEAT',
            resolveBillingCurrency(company.defaultRegionCode),
        );
    }

    /** Read the authoritative live seat quantity from the provider. */
    private async readLiveSeatQuantity(
        ref: SubscriptionRef,
        companyId: string,
    ): Promise<number> {
        try {
            return await this.provider.getSeatQuantity(ref);
        } catch (err) {
            this.logger.error(
                `Failed to read live seat quantity for company ${companyId} ` +
                    `(subscription ${ref.subscriptionId}): ${err instanceof Error ? err.message : String(err)}`,
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
                    `(subscription ${ref.subscriptionId}): ${err instanceof Error ? err.message : String(err)}`,
            );
            throw new HttpException(
                `The billing provider rejected the seat change: ${err instanceof Error ? err.message : String(err)}`,
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
                    `${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. ` +
                    `Reconcile manually against the provider dashboard.`,
            );
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async findCompany(companyId: string): Promise<Company> {
        const company = await this.companyRepo.findOne({
            where: { id: companyId },
        });
        if (!company)
            throw new NotFoundException(`Company ${companyId} not found`);
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

    /** Guard client-supplied redirect URLs against open-redirect; must be http(s) on an allowed origin. */
    private assertAllowedRedirectUrl(url: string, field: string): void {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new BadRequestException(
                `${field} must be an absolute http(s) URL`,
            );
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

    /** Count active (isActive=true) users for a company. */
    private async countActiveUsers(companyId: string): Promise<number> {
        return this.userRepo.count({ where: { companyId, isActive: true } });
    }

    /**
     * Resolve the provider price id for (kind, currency). Throws if not found or
     * not yet synced to Stripe (providerPriceId is null).
     */
    private async getProviderPriceId(
        kind: 'SEAT' | 'ENTERPRISE_BASE',
        currency: string,
    ): Promise<string> {
        const row = await this.priceRepo.findOne({
            where: { kind, currency, active: true },
        });
        if (!row) {
            throw new BadRequestException(
                `No active ${kind} price found for currency ${currency}. ` +
                    `Run POST /billing/prices/sync first.`,
            );
        }
        if (!row.providerPriceId) {
            throw new BadRequestException(
                `${kind} price for ${currency} has not been synced to Stripe yet. ` +
                    `Run POST /billing/prices/sync first.`,
            );
        }
        return row.providerPriceId;
    }
}
