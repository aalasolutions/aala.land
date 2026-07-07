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
import { StripeEvent } from './entities/stripe-event.entity';
import {
    BILLING_PROVIDER,
    BillingPlan,
    BillingProvider,
    ProviderWebhookEvent,
} from './provider/billing-provider.interface';
import { BillingEventDispatcher } from './events/billing-event-dispatcher';
import {
    PaymentFailedEvent,
    PaymentSucceededEvent,
    PlanChangedEvent,
    SeatQuantityChangedEvent,
    SubscriptionActivatedEvent,
    SubscriptionCanceledEvent,
    SubscriptionUpdatedEvent,
} from './events/billing-events';

/**
 * Maps a billing plan to a subscription tier. Unit 3 added ENTERPRISE to the
 * enum, so this dynamic lookup now resolves both PRO and ENTERPRISE. The
 * fallback (??  PRO) is a safety net for any unrecognised future plan string
 * arriving from the webhook before the backend is updated.
 */
export function planToTier(plan: BillingPlan): SubscriptionTier {
    const tier = (SubscriptionTier as Record<string, SubscriptionTier>)[plan];
    return tier ?? SubscriptionTier.PRO;
}

function isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; driverError?: { code?: string } };
    return e?.code === '23505' || e?.driverError?.code === '23505';
}

@Injectable()
export class BillingWebhookService implements OnModuleInit {
    private readonly logger = new Logger(BillingWebhookService.name);

    constructor(
        @InjectRepository(StripeEvent)
        private readonly eventRepo: Repository<StripeEvent>,
        @InjectRepository(Company)
        private readonly companyRepo: Repository<Company>,
        @Inject(BILLING_PROVIDER)
        private readonly provider: BillingProvider,
        private readonly dispatcher: BillingEventDispatcher,
    ) {}

    onModuleInit(): void {
        this.dispatcher.register('SubscriptionActivated', (e) => this.onSubscriptionActivated(e));
        this.dispatcher.register('SubscriptionUpdated', (e) => this.onSubscriptionUpdated(e));
        this.dispatcher.register('SeatQuantityChanged', (e) => this.onSeatQuantityChanged(e));
        this.dispatcher.register('PlanChanged', (e) => this.onPlanChanged(e));
        this.dispatcher.register('SubscriptionCanceled', (e) => this.onSubscriptionCanceled(e));
        this.dispatcher.register('PaymentSucceeded', (e) => this.onPaymentSucceeded(e));
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
            this.logger.warn(`Webhook rejected: ${(err as Error).message}`);
            throw new BadRequestException('Webhook signature verification failed');
        }

        // Insert-first idempotency (contract section 6, rule 2). A duplicate
        // provider_event_id hits the UNIQUE constraint. If that prior row already
        // finished processing, ack and stop. If it never finished (a crash, or a
        // handler failure that left processed_at NULL), fall through and
        // re-dispatch instead of silently dropping the event on Stripe's retry.
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
                await this.dispatcher.dispatch(event);
            }
        } catch (err) {
            // processed_at stays NULL for inspection (contract section 6, rule 3).
            this.logger.error(
                `Handler failed for ${parsed.providerEventId} (${parsed.providerEventType}): ${(err as Error).message}`,
            );
            throw new InternalServerErrorException('Webhook processing failed');
        }

        await this.eventRepo.update(
            { providerEventId: parsed.providerEventId },
            { processedAt: new Date() },
        );
        return { received: true };
    }

    // ---- Company sync handlers (contract section 8) -------------------------
    // These are the ONLY writers of purchasedSeats, billingStatus, and
    // billingSubscriptionId in the codebase.

    private async onSubscriptionActivated(event: SubscriptionActivatedEvent): Promise<void> {
        const tier = planToTier(event.plan);
        const limits = TIER_LIMITS[tier];
        // Seat-bearing event: guard purchasedSeats against stale/out-of-order
        // delivery via billing_last_event_at (race audit 2026-07-07, P1c).
        await this.applySeatSync(event.companyId, event.name, event.occurredAt, {
            billingSubscriptionId: event.subscriptionId,
            billingStatus: event.status,
            subscriptionTier: tier,
            purchasedSeats: Math.max(event.quantity, 1),
            maxUsers: limits.maxUsers,
            maxCountries: limits.maxCountries,
            maxProperties: limits.maxProperties,
        });
    }

    private async onSubscriptionUpdated(event: SubscriptionUpdatedEvent): Promise<void> {
        await this.applySeatSync(event.companyId, event.name, event.occurredAt, {
            purchasedSeats: Math.max(event.quantity, 1),
            billingStatus: event.status,
        });
    }

    private async onSeatQuantityChanged(event: SeatQuantityChangedEvent): Promise<void> {
        await this.applySeatSync(event.companyId, event.name, event.occurredAt, {
            purchasedSeats: Math.max(event.quantity, 1),
        });
    }

    private async onPlanChanged(event: PlanChangedEvent): Promise<void> {
        const tier = planToTier(event.plan);
        const limits = TIER_LIMITS[tier];
        await this.updateCompany(event.companyId, event.name, {
            subscriptionTier: tier,
            maxUsers: limits.maxUsers,
            maxCountries: limits.maxCountries,
            maxProperties: limits.maxProperties,
        });
    }

    private async onSubscriptionCanceled(event: SubscriptionCanceledEvent): Promise<void> {
        // External cancels bypass the unit 3 downgrade gate by design (contract
        // section 8): the tier drops to FREE even with more than 1 active user.
        // Excess users stay active; the synced FREE caps block further adds.
        const limits = TIER_LIMITS[SubscriptionTier.FREE];
        await this.updateCompany(event.companyId, event.name, {
            subscriptionTier: SubscriptionTier.FREE,
            billingSubscriptionId: null,
            billingStatus: 'canceled',
            maxUsers: limits.maxUsers,
            maxCountries: limits.maxCountries,
            maxProperties: limits.maxProperties,
        });
    }

    private async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
        // One-off invoices (future top-ups) carry no subscription: not our status.
        if (!event.subscriptionId) return;
        await this.updateCompany(event.companyId, event.name, { billingStatus: 'active' });
    }

    private async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
        if (!event.subscriptionId) return;
        await this.updateCompany(event.companyId, event.name, { billingStatus: 'past_due' });
    }

    private async updateCompany(
        companyId: string,
        eventName: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patch: Record<string, any>,
    ): Promise<void> {
        const result = await this.companyRepo.update(companyId, patch);
        if (!result.affected) {
            // A retry cannot conjure a missing company row; warn and move on so
            // the event is still marked processed.
            this.logger.warn(`${eventName}: company ${companyId} not found, nothing updated`);
        }
    }

    /**
     * Apply a seat-bearing sync, guarding purchasedSeats (and the other columns
     * in the patch) against stale or out-of-order Stripe delivery (race audit
     * 2026-07-07, P1c).
     *
     * A single conditional UPDATE advances billing_last_event_at to the event's
     * created time and applies the patch ONLY when this event is at least as new
     * as the last one applied (`billing_last_event_at IS NULL OR <= :occurredAt`).
     * Doing the compare-and-set in one statement is atomic under READ COMMITTED,
     * so two events for the same company delivered concurrently cannot let the
     * older one win. A strictly-older event affects 0 rows and is skipped; that
     * is distinguished from a genuinely missing company by a follow-up existence
     * check, so the event is still acked either way.
     */
    private async applySeatSync(
        companyId: string,
        eventName: string,
        occurredAt: Date,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patch: Record<string, any>,
    ): Promise<void> {
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

        if (result.affected) return;

        // 0 rows: either the company is gone, or a newer event already landed.
        const exists = await this.companyRepo.exists({ where: { id: companyId } });
        if (!exists) {
            this.logger.warn(`${eventName}: company ${companyId} not found, nothing updated`);
        } else {
            this.logger.warn(
                `${eventName}: skipped stale/out-of-order event for company ${companyId} ` +
                `(event time ${occurredAt.toISOString()} is older than the last applied sync)`,
            );
        }
    }
}
