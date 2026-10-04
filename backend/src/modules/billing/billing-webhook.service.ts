import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Company,
  SubscriptionTier,
  TIER_LIMITS,
} from '../companies/entities/company.entity';
import { BillingEvent } from './entities/billing-event.entity';
import {
  BILLING_PROVIDER,
  BillingPlan,
  BillingProvider,
  ProviderWebhookEvent,
} from './provider/billing-provider.interface';
import { BillingEventDispatcher } from './events/billing-event-dispatcher';
import { BillingHistoryService } from './billing-history.service';
import { BillingService } from './billing.service';
import {
  ChargedUnitAmount,
  NormalizedBillingEvent,
  PaymentFailedEvent,
  PaymentSucceededEvent,
  PlanChangedEvent,
  SeatQuantityChangedEvent,
  SubscriptionActivatedEvent,
  SubscriptionCanceledEvent,
  SubscriptionUpdatedEvent,
} from './events/billing-events';
import { errorMessage } from '@shared/utils/error.util';

/** Falls back to PRO as a safety net for any unrecognised plan string arriving from the webhook. */
export function planToTier(plan: BillingPlan): SubscriptionTier {
  const tier = (SubscriptionTier as Record<string, SubscriptionTier>)[plan];
  return tier ?? SubscriptionTier.PRO;
}

type ChargedAmountColumns = Partial<
  Pick<
    Company,
    | 'chargedSeatNet'
    | 'chargedSeatGross'
    | 'chargedBaseNet'
    | 'chargedBaseGross'
  >
>;

function chargedAmountPatch(
  lines: ChargedUnitAmount[] | undefined,
): ChargedAmountColumns {
  const patch: ChargedAmountColumns = {};
  for (const line of lines ?? []) {
    if (line.kind === 'SEAT') {
      patch.chargedSeatNet = line.net;
      patch.chargedSeatGross = line.gross;
    } else {
      patch.chargedBaseNet = line.net;
      patch.chargedBaseGross = line.gross;
    }
  }
  return patch;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}

@Injectable()
export class BillingWebhookService implements OnModuleInit {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(
    @InjectRepository(BillingEvent)
    private readonly eventRepo: Repository<BillingEvent>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @Inject(BILLING_PROVIDER)
    private readonly provider: BillingProvider,
    private readonly dispatcher: BillingEventDispatcher,
    private readonly history: BillingHistoryService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register('SubscriptionActivated', (e) =>
      this.onSubscriptionActivated(e),
    );
    // Registered second: resizes only after the company row holds the subscription.
    this.dispatcher.register('SubscriptionActivated', (e) =>
      this.reconcileSeats(e),
    );
    this.dispatcher.register('SubscriptionUpdated', (e) =>
      this.onSubscriptionUpdated(e),
    );
    this.dispatcher.register('SeatQuantityChanged', (e) =>
      this.onSeatQuantityChanged(e),
    );
    this.dispatcher.register('PlanChanged', (e) => this.onPlanChanged(e));
    this.dispatcher.register('SubscriptionCanceled', (e) =>
      this.onSubscriptionCanceled(e),
    );
    this.dispatcher.register('PaymentSucceeded', (e) =>
      this.onPaymentSucceeded(e),
    );
    this.dispatcher.register('PaymentFailed', (e) => this.onPaymentFailed(e));
  }

  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing webhook payload or signature');
    }

    let parsed: ProviderWebhookEvent;
    try {
      parsed = await this.provider.parseWebhook(rawBody, signature);
    } catch (err) {
      // Never log the raw body. The error message is enough for diagnosis.
      this.logger.warn(`Webhook rejected: ${errorMessage(err)}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    // Duplicate hits UNIQUE; re-dispatch instead of dropping if the prior row never finished.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.eventRepo.insert({
        providerEventId: parsed.providerEventId,
        type: parsed.providerEventType,
        payload: parsed.payload,
      } as any);
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err; // 500: the provider retries a transient insert failure.
      }
      const existing = await this.eventRepo.findOne({
        where: { providerEventId: parsed.providerEventId },
      });
      if (existing?.processedAt) {
        this.logger.log(
          `Duplicate webhook ${parsed.providerEventId} (${parsed.providerEventType}), already processed, skipping`,
        );
        return { received: true };
      }
      this.logger.warn(
        `Webhook ${parsed.providerEventId} (${parsed.providerEventType}) was received but never finished processing; re-dispatching`,
      );
    }

    try {
      for (const event of parsed.events) {
        if (!(await this.isCompanyCustomer(parsed.providerEventId, event))) {
          continue;
        }
        await this.dispatcher.dispatch(event);
      }
    } catch (err) {
      // processed_at stays NULL so a failed handler can be inspected and retried.
      this.logger.error(
        `Handler failed for ${parsed.providerEventId} (${parsed.providerEventType}): ${errorMessage(err)}`,
      );
      throw new InternalServerErrorException('Webhook processing failed');
    }

    await this.eventRepo.update(
      { providerEventId: parsed.providerEventId },
      { processedAt: new Date() },
    );
    return { received: true };
  }

  /** A checkout opened client-side can name any company, so the customer must be the one the server stored. */
  private async isCompanyCustomer(
    providerEventId: string,
    event: NormalizedBillingEvent,
  ): Promise<boolean> {
    const company = await this.companyRepo.findOne({
      where: { id: event.companyId },
      select: ['id', 'billingCustomerId'],
    });
    const stored = company?.billingCustomerId ?? null;
    if (stored && stored === event.customerId) return true;
    this.logger.warn(
      `Webhook ${providerEventId} (${event.name}): customer ${event.customerId} does not match company ${event.companyId} customer ${stored ?? 'none'}; skipped`,
    );
    return false;
  }

  // Only writer of purchasedSeats, billingStatus, billingSubscriptionId and charged_* amounts.

  private async onSubscriptionActivated(
    event: SubscriptionActivatedEvent,
  ): Promise<void> {
    const tier = planToTier(event.plan);
    const limits = TIER_LIMITS[tier];
    // Guards purchasedSeats against stale/out-of-order delivery via billing_last_event_at.
    const applied = await this.applyRecencyGuardedSync(
      event.companyId,
      event.name,
      event.occurredAt,
      {
        billingSubscriptionId: event.subscriptionId,
        billingStatus: event.status,
        subscriptionTier: tier,
        purchasedSeats: Math.max(event.quantity, 1),
        // Pin the subscription currency here (webhook is the single writer).
        billingCurrency: event.currency,
        maxUsers: limits.maxUsers,
        maxRegions: limits.maxRegions,
        maxProperties: limits.maxProperties,
      },
    );
    if (applied) return;
    // A late create still fills a paid company left without a subscription id.
    await this.companyRepo
      .createQueryBuilder()
      .update(Company)
      .set({
        billingSubscriptionId: event.subscriptionId,
        billingCurrency: event.currency,
      })
      .where('id = :companyId', { companyId: event.companyId })
      .andWhere('billing_subscription_id IS NULL')
      .andWhere('subscription_tier <> :free', { free: SubscriptionTier.FREE })
      .execute();
  }

  /** Active team decides the seat count; a failure throws so the provider retries. */
  private async reconcileSeats(
    event: SubscriptionActivatedEvent,
  ): Promise<void> {
    if (!this.provider.checkoutQuantityEditable || !event.subscriptionId)
      return;
    const seats = await this.billing.reconcileSeatsToActiveUsers(
      event.companyId,
      event.subscriptionId,
    );
    // The purchase email runs after this and reports the reconciled count.
    if (seats !== null) event.quantity = seats;
  }

  private async onSubscriptionUpdated(
    event: SubscriptionUpdatedEvent,
  ): Promise<void> {
    await this.applyRecencyGuardedSync(
      event.companyId,
      event.name,
      event.occurredAt,
      {
        purchasedSeats: Math.max(event.quantity, 1),
        billingStatus: event.status,
      },
    );
  }

  private async onSeatQuantityChanged(
    event: SeatQuantityChangedEvent,
  ): Promise<void> {
    await this.applyRecencyGuardedSync(
      event.companyId,
      event.name,
      event.occurredAt,
      {
        purchasedSeats: Math.max(event.quantity, 1),
      },
    );
  }

  private async onPlanChanged(event: PlanChangedEvent): Promise<void> {
    const tier = planToTier(event.plan);
    const limits = TIER_LIMITS[tier];
    const stored = await this.companyRepo.findOne({
      where: { id: event.companyId },
      select: ['id', 'subscriptionTier'],
    });
    // Same tier (renewal, scheduled cancel): keep operator-set limits.
    const patch =
      stored?.subscriptionTier === tier
        ? { subscriptionTier: tier }
        : {
            subscriptionTier: tier,
            maxUsers: limits.maxUsers,
            maxRegions: limits.maxRegions,
            maxProperties: limits.maxProperties,
          };
    // Recency-guarded too: an out-of-order/retried plan swap could clobber newer tier state.
    await this.applyRecencyGuardedSync(
      event.companyId,
      event.name,
      event.occurredAt,
      patch,
    );
  }

  private async onSubscriptionCanceled(
    event: SubscriptionCanceledEvent,
  ): Promise<void> {
    // Bypasses the downgrade gate by design; guarded so a stale cancel can't clobber a resubscribe.
    const limits = TIER_LIMITS[SubscriptionTier.FREE];
    await this.applyRecencyGuardedSync(
      event.companyId,
      event.name,
      event.occurredAt,
      {
        subscriptionTier: SubscriptionTier.FREE,
        billingSubscriptionId: null,
        billingStatus: 'canceled',
        chargedSeatNet: null,
        chargedSeatGross: null,
        chargedBaseNet: null,
        chargedBaseGross: null,
        maxUsers: limits.maxUsers,
        maxRegions: limits.maxRegions,
        maxProperties: limits.maxProperties,
      },
    );
  }

  private async onPaymentSucceeded(
    event: PaymentSucceededEvent,
  ): Promise<void> {
    // Record the invoice regardless of subscription (future top-ups included).
    await this.history.recordPayment(event);
    // One-off invoices (future top-ups) carry no subscription: not our status.
    if (!event.subscriptionId) return;
    const patch = {
      ...chargedAmountPatch(event.chargedUnitAmounts),
      // A zero-charge settlement never moves paid status.
      ...(event.settledWithoutCharge ? {} : { billingStatus: 'active' }),
    };
    if (Object.keys(patch).length === 0) return;
    await this.applyCurrentSubscriptionUpdate(
      event.companyId,
      event.subscriptionId,
      event.occurredAt,
      event.name,
      patch,
    );
  }

  private async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    await this.history.recordPayment(event);
    if (!event.subscriptionId) return;
    await this.applyCurrentSubscriptionUpdate(
      event.companyId,
      event.subscriptionId,
      event.occurredAt,
      event.name,
      { billingStatus: 'past_due' },
    );
  }

  /** Not recency-guarded (a transaction may precede its activation), but never from another subscription. */
  private async applyCurrentSubscriptionUpdate(
    companyId: string,
    subscriptionId: string,
    occurredAt: Date,
    eventName: string,
    patch: ChargedAmountColumns & Partial<Pick<Company, 'billingStatus'>>,
  ): Promise<void> {
    const result = await this.companyRepo
      .createQueryBuilder()
      .update(Company)
      .set(patch)
      .where('id = :companyId', { companyId })
      .andWhere(
        '(billing_subscription_id = :subscriptionId OR (billing_subscription_id IS NULL AND (billing_last_event_at IS NULL OR billing_last_event_at <= :occurredAt)))',
        { subscriptionId, occurredAt },
      )
      .execute();
    if (!result.affected) {
      // Zero rows is not an error: retrying cannot make a stale subscription current.
      this.logger.log(
        `${eventName}: company ${companyId} not updated, subscription ${subscriptionId} is not current or the company is missing`,
      );
    }
  }

  /** <= not <: provider timestamps are shared by several events, so < would drop all but one. */
  private async applyRecencyGuardedSync(
    companyId: string,
    eventName: string,
    occurredAt: Date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    patch: Record<string, any>,
  ): Promise<boolean> {
    const result = await this.companyRepo
      .createQueryBuilder()
      .update(Company)
      .set({ ...patch, billingLastEventAt: occurredAt })
      .where('id = :companyId', { companyId })
      .andWhere(
        '(billing_last_event_at IS NULL OR billing_last_event_at <= :occurredAt)',
        { occurredAt },
      )
      .execute();

    if (result.affected) return true;

    // 0 rows: either the company is gone, or a newer event already landed.
    const exists = await this.companyRepo.exists({ where: { id: companyId } });
    if (!exists) {
      this.logger.warn(
        `${eventName}: company ${companyId} not found, nothing updated`,
      );
    } else {
      this.logger.warn(
        `${eventName}: skipped stale/out-of-order event for company ${companyId} ` +
          `(event time ${occurredAt.toISOString()} is older than the last applied sync)`,
      );
    }
    return false;
  }
}
