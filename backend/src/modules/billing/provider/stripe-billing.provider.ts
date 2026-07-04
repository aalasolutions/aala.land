import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
    BillingPlan,
    BillingPriceKind,
    BillingProvider,
    ChangePlanInput,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    EnsureCustomerInput,
    ProviderWebhookEvent,
    SubscriptionRef,
} from './billing-provider.interface';
import {
    NormalizedBillingEvent,
    PaymentFailedEvent,
    PaymentSucceededEvent,
    PlanChangedEvent,
    SeatQuantityChangedEvent,
    SubscriptionActivatedEvent,
    SubscriptionCanceledEvent,
    SubscriptionUpdatedEvent,
} from '../events/billing-events';

/**
 * Minimal structural shapes for the provider objects this file reads. The Stripe
 * SDK types shift between API versions (current_period_end moved from the
 * subscription to the item; invoice.subscription moved under
 * parent.subscription_details), so the normalizer reads through these tolerant
 * shapes and checks every path instead of trusting one SDK snapshot.
 */
interface StripeSubscriptionItemLike {
    quantity?: number | null;
    current_period_end?: number | null;
    price?: { id?: string; metadata?: Record<string, string> } | null;
}

interface StripeSubscriptionLike {
    id: string;
    status: string;
    customer: string | { id: string } | null;
    metadata?: Record<string, string> | null;
    items?: { data?: StripeSubscriptionItemLike[] } | null;
    current_period_end?: number | null;
    ended_at?: number | null;
    canceled_at?: number | null;
}

interface StripeInvoiceLike {
    id?: string;
    customer: string | { id: string } | null;
    currency?: string | null;
    amount_paid?: number | null;
    amount_due?: number | null;
    attempt_count?: number | null;
    subscription?: string | { id: string } | null;
    subscription_details?: { metadata?: Record<string, string> } | null;
    parent?: {
        subscription_details?: {
            subscription?: string | { id: string } | null;
            metadata?: Record<string, string> | null;
        } | null;
    } | null;
}

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

/** Returns the id whether the provider inlined the object or sent a string ref. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
    if (!ref) return null;
    return typeof ref === 'string' ? ref : (ref.id ?? null);
}

/** Stripe timestamps are epoch seconds. */
export function epochToDate(epochSeconds: number | null | undefined): Date | null {
    if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) return null;
    return new Date(epochSeconds * 1000);
}

/**
 * Derives (plan, quantity, currentPeriodEnd) from a subscription's line items.
 * Composition is frozen by the contract: Pro is one SEAT item; Enterprise is
 * ENTERPRISE_BASE x 1 plus a SEAT item. Detection reads the price metadata that
 * unit 1's ensurePrice stamps; if metadata is absent (e.g. Stripe CLI fixture
 * prices), the fallback treats the first non-base item as the seat item and the
 * plan as PRO.
 */
export function deriveSubscriptionShape(sub: StripeSubscriptionLike): {
    plan: BillingPlan;
    quantity: number;
    currentPeriodEnd: Date | null;
} {
    const items = sub.items?.data ?? [];
    const baseItem = items.find((i) => i.price?.metadata?.kind === 'ENTERPRISE_BASE');
    const seatItem =
        items.find((i) => i.price?.metadata?.kind === 'SEAT') ??
        items.find((i) => i !== baseItem) ??
        null;
    const plan: BillingPlan = baseItem ? 'ENTERPRISE' : 'PRO';
    const quantity = Math.max(seatItem?.quantity ?? 1, 1);
    const currentPeriodEnd =
        epochToDate(seatItem?.current_period_end) ?? epochToDate(sub.current_period_end);
    return { plan, quantity, currentPeriodEnd };
}

@Injectable()
export class StripeBillingProvider implements BillingProvider {
    private readonly logger = new Logger(StripeBillingProvider.name);
    private readonly stripe: Stripe;
    private productIdCache: string | null = null;

    constructor(private readonly config: ConfigService) {
        this.stripe = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'));
    }

    async ensureCustomer(input: EnsureCustomerInput): Promise<string> {
        const customer = await this.stripe.customers.create({
            name: input.companyName,
            email: input.email ?? undefined,
            metadata: { companyId: input.companyId },
        });
        return customer.id;
    }

    async ensurePrice(kind: BillingPriceKind, currency: string, unitAmount: number): Promise<string> {
        const product = await this.ensureProduct();
        const price = await this.stripe.prices.create({
            product,
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            recurring: { interval: 'month' },
            metadata: { kind, currency },
        });
        return price.id;
    }

    async parseWebhook(rawBody: Buffer, signature: string): Promise<ProviderWebhookEvent> {
        // Read lazily so envs that never receive webhooks still boot; a missing
        // secret surfaces as a rejected webhook plus a clear log line.
        const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
        const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
        const events = await this.normalizeEvent(event);
        return {
            providerEventId: event.id,
            providerEventType: event.type,
            payload: event as unknown as Record<string, unknown>,
            events,
        };
    }

    private async normalizeEvent(event: Stripe.Event): Promise<NormalizedBillingEvent[]> {
        const occurredAt = new Date(event.created * 1000);
        switch (event.type as string) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                return this.normalizeSubscriptionEvent(event, occurredAt);
            case 'invoice.paid':
            case 'invoice.payment_succeeded':
            case 'invoice.payment_failed':
                return this.normalizeInvoiceEvent(event, occurredAt);
            default:
                return [];
        }
    }

    private async normalizeSubscriptionEvent(
        event: Stripe.Event,
        occurredAt: Date,
    ): Promise<NormalizedBillingEvent[]> {
        const sub = event.data.object as unknown as StripeSubscriptionLike;
        const customerId = idOf(sub.customer);
        const companyId = await this.resolveCompanyId(sub.metadata?.companyId ?? null, customerId);
        if (!companyId || !customerId) {
            this.logger.warn(
                `Webhook ${event.id} (${event.type}): companyId unresolved, emitting no events`,
            );
            return [];
        }

        const base = { companyId, customerId, subscriptionId: sub.id, occurredAt };
        const { plan, quantity, currentPeriodEnd } = deriveSubscriptionShape(sub);

        if ((event.type as string) === 'customer.subscription.deleted') {
            const canceled: SubscriptionCanceledEvent = {
                name: 'SubscriptionCanceled',
                ...base,
                endedAt: epochToDate(sub.ended_at) ?? epochToDate(sub.canceled_at),
            };
            return [canceled];
        }

        const previous = (event.data as { previous_attributes?: Record<string, unknown> })
            .previous_attributes;
        const previousStatus = typeof previous?.status === 'string' ? previous.status : null;
        const isActiveNow = ACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
        const becameActive =
            (event.type as string) === 'customer.subscription.created'
                ? isActiveNow
                : isActiveNow &&
                  previousStatus !== null &&
                  !ACTIVE_SUBSCRIPTION_STATUSES.includes(previousStatus);

        if (becameActive) {
            const activated: SubscriptionActivatedEvent = {
                name: 'SubscriptionActivated',
                ...base,
                plan,
                quantity,
                status: sub.status,
                currentPeriodEnd,
            };
            return [activated];
        }

        if ((event.type as string) === 'customer.subscription.created') {
            // Incomplete checkout: the activating customer.subscription.updated follows.
            return [];
        }

        const updated: SubscriptionUpdatedEvent = {
            name: 'SubscriptionUpdated',
            ...base,
            plan,
            quantity,
            status: sub.status,
            currentPeriodEnd,
        };
        const seatChanged: SeatQuantityChangedEvent = {
            name: 'SeatQuantityChanged',
            ...base,
            quantity,
        };
        const out: NormalizedBillingEvent[] = [updated, seatChanged];

        if (previous && 'items' in previous) {
            const planChanged: PlanChangedEvent = { name: 'PlanChanged', ...base, plan, quantity };
            out.push(planChanged);
        }
        return out;
    }

    private async normalizeInvoiceEvent(
        event: Stripe.Event,
        occurredAt: Date,
    ): Promise<NormalizedBillingEvent[]> {
        const invoice = event.data.object as unknown as StripeInvoiceLike;
        const customerId = idOf(invoice.customer);
        const subscriptionId =
            idOf(invoice.subscription) ??
            idOf(invoice.parent?.subscription_details?.subscription ?? null);
        const metadataCompanyId =
            invoice.subscription_details?.metadata?.companyId ??
            invoice.parent?.subscription_details?.metadata?.companyId ??
            null;
        const companyId = await this.resolveCompanyId(metadataCompanyId, customerId);
        if (!companyId || !customerId) {
            this.logger.warn(
                `Webhook ${event.id} (${event.type}): companyId unresolved, emitting no events`,
            );
            return [];
        }

        const base = { companyId, customerId, subscriptionId, occurredAt };
        const currency = (invoice.currency ?? 'usd').toLowerCase();

        if ((event.type as string) === 'invoice.payment_failed') {
            const failed: PaymentFailedEvent = {
                name: 'PaymentFailed',
                ...base,
                amount: invoice.amount_due ?? 0,
                currency,
                invoiceId: invoice.id ?? null,
                attemptCount: invoice.attempt_count ?? null,
            };
            return [failed];
        }

        const succeeded: PaymentSucceededEvent = {
            name: 'PaymentSucceeded',
            ...base,
            amount: invoice.amount_paid ?? 0,
            currency,
            invoiceId: invoice.id ?? null,
        };
        return [succeeded];
    }

    /**
     * Resolution order: explicit metadata on the subscription or invoice, then the
     * customer's metadata (unit 1's ensureCustomer stamps companyId on every
     * customer it creates). Returns null when neither source resolves.
     */
    private async resolveCompanyId(
        metadataCompanyId: string | null,
        customerId: string | null,
    ): Promise<string | null> {
        if (metadataCompanyId) return metadataCompanyId;
        if (!customerId) return null;
        try {
            const customer = await this.stripe.customers.retrieve(customerId);
            if ((customer as { deleted?: boolean }).deleted) return null;
            const metadata = (customer as { metadata?: Record<string, string> }).metadata;
            return metadata?.companyId ?? null;
        } catch (err) {
            this.logger.warn(
                `Customer lookup failed for ${customerId}: ${(err as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Find-or-create one shared Product. Best-effort dedupe: the Stripe Search API has indexing lag
     * (up to about a minute), so a rare duplicate Product is possible and harmless, because prices
     * are always resolved via billing_prices.provider_price_id, never by Product. No manual Stripe step.
     */
    private async ensureProduct(): Promise<string> {
        if (this.productIdCache) return this.productIdCache;
        const found = await this.stripe.products.search({
            query: "active:'true' AND metadata['aala_product']:'subscription'",
        });
        if (found.data[0]) {
            this.productIdCache = found.data[0].id;
            return this.productIdCache;
        }
        const product = await this.stripe.products.create({
            name: 'AALA Subscription',
            metadata: { aala_product: 'subscription' },
        });
        this.logger.log(`Created Stripe product ${product.id}`);
        this.productIdCache = product.id;
        return product.id;
    }

    // -------------------------------------------------------------------------
    // Subscription lifecycle methods (unit 3)
    // -------------------------------------------------------------------------

    async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
            { price: input.seatPriceId, quantity: input.quantity },
        ];
        if (input.basePriceId) {
            // ENTERPRISE: flat base fee ($250) billed as quantity 1 on a separate line item.
            lineItems.push({ price: input.basePriceId, quantity: 1 });
        }

        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: input.customerId,
            line_items: lineItems,
            subscription_data: {
                metadata: { companyId: input.companyId },
            },
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
        });

        return { checkoutUrl: session.url!, subscriptionId: null };
    }

    async updateSeatQuantity(ref: SubscriptionRef, quantity: number): Promise<void> {
        const item = await this.findSeatItem(ref.subscriptionId);
        await this.stripe.subscriptionItems.update(item.id, { quantity });
    }

    async changePlan(input: ChangePlanInput): Promise<void> {
        const sub = await this.stripe.subscriptions.retrieve(input.subscriptionId, {
            expand: ['items'],
        }) as unknown as { items: { data: { id: string; price: { metadata?: Record<string, string> } }[] } };

        const items: Stripe.SubscriptionUpdateParams.Item[] = [];
        const currentBaseItem = sub.items.data.find(
            (i) => i.price?.metadata?.kind === 'ENTERPRISE_BASE',
        );
        const currentSeatItem = sub.items.data.find(
            (i) => i.price?.metadata?.kind === 'SEAT',
        );

        // Always update the seat item to the new price + preserve quantity.
        if (currentSeatItem) {
            items.push({ id: currentSeatItem.id, price: input.seatPriceId, quantity: input.quantity });
        }

        if (input.basePriceId) {
            if (currentBaseItem) {
                // Switching from PRO->ENTERPRISE or updating ENTERPRISE base price.
                items.push({ id: currentBaseItem.id, price: input.basePriceId, quantity: 1 });
            } else {
                // PRO->ENTERPRISE: add the base line item.
                items.push({ price: input.basePriceId, quantity: 1 });
            }
        } else if (currentBaseItem) {
            // ENTERPRISE->PRO: remove the base line item.
            items.push({ id: currentBaseItem.id, deleted: true });
        }

        await this.stripe.subscriptions.update(input.subscriptionId, { items });
    }

    async cancel(ref: SubscriptionRef): Promise<void> {
        await this.stripe.subscriptions.update(ref.subscriptionId, {
            cancel_at_period_end: true,
        });
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Retrieve the SEAT line item for a subscription. Throws if not found. */
    private async findSeatItem(
        subscriptionId: string,
    ): Promise<{ id: string }> {
        const sub = await this.stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items'],
        }) as unknown as { items: { data: { id: string; price?: { metadata?: Record<string, string> } }[] } };
        const item =
            sub.items.data.find((i) => i.price?.metadata?.kind === 'SEAT') ??
            sub.items.data[0];
        if (!item) throw new Error(`No subscription items found on ${subscriptionId}`);
        return { id: item.id };
    }

    /** Thin SubscriptionRef builder for internal use. */
    private toRef(subscriptionId: string, customerId: string): SubscriptionRef {
        return { subscriptionId, customerId };
    }
}
