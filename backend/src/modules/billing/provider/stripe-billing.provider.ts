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

/** Tolerant shapes: Stripe SDK types drift across API versions (current_period_end moved to item, invoice.subscription moved under parent.subscription_details). */
interface StripeSubscriptionItemLike {
    quantity?: number | null;
    current_period_end?: number | null;
    price?: { id?: string; metadata?: Record<string, string> } | null;
}

interface StripeSubscriptionLike {
    id: string;
    status: string;
    /** Subscription currency (lowercase ISO 4217); all prices on a sub share it. */
    currency?: string | null;
    customer: string | { id: string } | null;
    metadata?: Record<string, string> | null;
    items?: { data?: StripeSubscriptionItemLike[] } | null;
    current_period_end?: number | null;
    ended_at?: number | null;
    canceled_at?: number | null;
    cancel_at_period_end?: boolean | null;
    cancel_at?: number | null;
}

interface StripeInvoiceLike {
    id?: string;
    customer: string | { id: string } | null;
    currency?: string | null;
    amount_paid?: number | null;
    amount_due?: number | null;
    attempt_count?: number | null;
    hosted_invoice_url?: string | null;
    invoice_pdf?: string | null;
    period_start?: number | null;
    period_end?: number | null;
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
export function idOf(
    ref: string | { id: string } | null | undefined,
): string | null {
    if (!ref) return null;
    return typeof ref === 'string' ? ref : (ref.id ?? null);
}

/** Stripe timestamps are epoch seconds. */
export function epochToDate(
    epochSeconds: number | null | undefined,
): Date | null {
    if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds))
        return null;
    return new Date(epochSeconds * 1000);
}

/** Derives (plan, quantity, currentPeriodEnd) from line items. PRO = SEAT item only; ENTERPRISE = ENTERPRISE_BASE + SEAT. No metadata (legacy/fixture prices) falls back to base-presence detection. */
export function deriveSubscriptionShape(sub: StripeSubscriptionLike): {
    plan: BillingPlan;
    quantity: number;
    currentPeriodEnd: Date | null;
} {
    const items = sub.items?.data ?? [];
    const baseItem = items.find(
        (i) => i.price?.metadata?.kind === 'ENTERPRISE_BASE',
    );
    const seatItem =
        items.find((i) => i.price?.metadata?.kind === 'SEAT') ?? null;
    // Plan: subscription metadata is primary; base-item presence is the fallback (only ENTERPRISE has a base).
    const metaPlan = sub.metadata?.plan;
    const plan: BillingPlan =
        metaPlan === 'PRO' || metaPlan === 'ENTERPRISE'
            ? metaPlan
            : baseItem
              ? 'ENTERPRISE'
              : 'PRO';
    // SEAT line = extra seats for ENTERPRISE (base includes first seat), ALL seats for PRO. Return total people count.
    const seatLineQty = seatItem?.quantity ?? 0;
    const quantity = Math.max(
        plan === 'ENTERPRISE' ? seatLineQty + 1 : seatLineQty,
        1,
    );
    const currentPeriodEnd =
        epochToDate(seatItem?.current_period_end) ??
        epochToDate(baseItem?.current_period_end) ??
        epochToDate(sub.current_period_end);
    return { plan, quantity, currentPeriodEnd };
}

@Injectable()
export class StripeBillingProvider implements BillingProvider {
    private readonly logger = new Logger(StripeBillingProvider.name);
    private readonly stripe: Stripe;
    private productIdCache: string | null = null;

    constructor(private readonly config: ConfigService) {
        // Race audit 2026-07-07: seat ops hold a PG advisory lock across these calls; cap timeout so a hung request can't pin the lock.
        this.stripe = new Stripe(
            this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
            {
                timeout: 8000,
                maxNetworkRetries: 0,
            },
        );
    }

    async ensureCustomer(input: EnsureCustomerInput): Promise<string> {
        const customer = await this.stripe.customers.create(
            {
                name: input.companyName,
                email: input.email ?? undefined,
                metadata: { companyId: input.companyId },
            },
            // Idempotency key collapses a retried/racing create onto the same customer.
            input.idempotencyKey
                ? { idempotencyKey: input.idempotencyKey }
                : undefined,
        );
        return customer.id;
    }

    async ensurePrice(
        kind: BillingPriceKind,
        currency: string,
        unitAmount: number,
    ): Promise<string> {
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

    async parseWebhook(
        rawBody: Buffer,
        signature: string,
    ): Promise<ProviderWebhookEvent> {
        // Read lazily: envs without webhooks still boot; missing secret fails the webhook, not startup.
        const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
        const event = this.stripe.webhooks.constructEvent(
            rawBody,
            signature,
            secret,
        );
        const events = await this.normalizeEvent(event);
        return {
            providerEventId: event.id,
            providerEventType: event.type,
            payload: event as unknown as Record<string, unknown>,
            events,
        };
    }

    private async normalizeEvent(
        event: Stripe.Event,
    ): Promise<NormalizedBillingEvent[]> {
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
        const companyId = await this.resolveCompanyId(
            sub.metadata?.companyId ?? null,
            customerId,
        );
        if (!companyId || !customerId) {
            this.logger.warn(
                `Webhook ${event.id} (${event.type}): companyId unresolved, emitting no events`,
            );
            return [];
        }

        const base = {
            companyId,
            customerId,
            subscriptionId: sub.id,
            occurredAt,
        };
        const { plan, quantity, currentPeriodEnd } =
            deriveSubscriptionShape(sub);

        if ((event.type as string) === 'customer.subscription.deleted') {
            const canceled: SubscriptionCanceledEvent = {
                name: 'SubscriptionCanceled',
                ...base,
                endedAt:
                    epochToDate(sub.ended_at) ?? epochToDate(sub.canceled_at),
            };
            return [canceled];
        }

        const previous = (
            event.data as { previous_attributes?: Record<string, unknown> }
        ).previous_attributes;
        const previousStatus =
            typeof previous?.status === 'string' ? previous.status : null;
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
                currency: (sub.currency ?? 'usd').toLowerCase(),
                currentPeriodEnd,
            };
            return [activated];
        }

        if ((event.type as string) === 'customer.subscription.created') {
            // Incomplete checkout; the activating .updated event follows.
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
        const out: NormalizedBillingEvent[] = [updated];

        // `items` only appears in previous_attributes when line items changed. Derive the
        // prior shape (prior items + prior metadata) to emit SeatQuantityChanged/PlanChanged
        // only for real changes; incomplete prior data falls back to emitting both.
        const previousItems =
            previous && 'items' in previous
                ? (
                      previous as {
                          items?: { data?: StripeSubscriptionItemLike[] };
                      }
                  ).items
                : undefined;

        if (previousItems !== undefined) {
            // Stripe puts the OLD value of a changed metadata key in previous_attributes.metadata;
            // reconstruct the prior plan tag, else the prior shape reads the NEW plan and misses the switch.
            const previousMetadata =
                previous && previous.metadata
                    ? {
                          ...sub.metadata,
                          ...(previous.metadata as Record<string, string>),
                      }
                    : sub.metadata;
            const previousShape = previousItems?.data?.length
                ? deriveSubscriptionShape({
                      ...sub,
                      items: previousItems,
                      metadata: previousMetadata,
                  })
                : null;

            if (!previousShape || previousShape.quantity !== quantity) {
                const seatChanged: SeatQuantityChangedEvent = {
                    name: 'SeatQuantityChanged',
                    ...base,
                    quantity,
                };
                out.push(seatChanged);
            }
            if (!previousShape || previousShape.plan !== plan) {
                const planChanged: PlanChangedEvent = {
                    name: 'PlanChanged',
                    ...base,
                    plan,
                    quantity,
                };
                out.push(planChanged);
            }
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
        const companyId = await this.resolveCompanyId(
            metadataCompanyId,
            customerId,
        );
        if (!companyId || !customerId) {
            this.logger.warn(
                `Webhook ${event.id} (${event.type}): companyId unresolved, emitting no events`,
            );
            return [];
        }

        const base = { companyId, customerId, subscriptionId, occurredAt };
        // Warn (don't fail) if a money-bearing field is absent: recording it as
        // 0/usd is indistinguishable from a real $0 invoice, so surface the drift.
        if (invoice.currency == null) {
            this.logger.warn(
                `Webhook ${event.id} (${event.type}): invoice ${invoice.id ?? '?'} has no currency; defaulting to usd`,
            );
        }
        const amountField =
            (event.type as string) === 'invoice.payment_failed'
                ? invoice.amount_due
                : invoice.amount_paid;
        if (amountField == null) {
            this.logger.warn(
                `Webhook ${event.id} (${event.type}): invoice ${invoice.id ?? '?'} has no amount; defaulting to 0`,
            );
        }
        const currency = (invoice.currency ?? 'usd').toLowerCase();
        // Invoice detail for billing history, carried on both outcomes.
        const detail = {
            hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
            invoicePdfUrl: invoice.invoice_pdf ?? null,
            periodStart: epochToDate(invoice.period_start),
            periodEnd: epochToDate(invoice.period_end),
        };

        if ((event.type as string) === 'invoice.payment_failed') {
            const failed: PaymentFailedEvent = {
                name: 'PaymentFailed',
                ...base,
                ...detail,
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
            ...detail,
            amount: invoice.amount_paid ?? 0,
            currency,
            invoiceId: invoice.id ?? null,
        };
        return [succeeded];
    }

    /** Resolution order: subscription/invoice metadata, then customer metadata. Null if neither resolves. */
    private async resolveCompanyId(
        metadataCompanyId: string | null,
        customerId: string | null,
    ): Promise<string | null> {
        if (metadataCompanyId) return metadataCompanyId;
        if (!customerId) return null;
        try {
            const customer = await this.stripe.customers.retrieve(customerId);
            if ((customer as { deleted?: boolean }).deleted) return null;
            const metadata = (customer as { metadata?: Record<string, string> })
                .metadata;
            return metadata?.companyId ?? null;
        } catch (err) {
            this.logger.warn(
                `Customer lookup failed for ${customerId}: ${(err as Error).message}`,
            );
            return null;
        }
    }

    /** Find-or-create one shared Product. Search API indexing lag can create a rare duplicate; harmless since prices resolve by id, not Product. */
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
            name: 'AALA.LAND Subscription',
            metadata: { aala_product: 'subscription' },
        });
        this.logger.log(`Created Stripe product ${product.id}`);
        this.productIdCache = product.id;
        return product.id;
    }

    // -------------------------------------------------------------------------
    // Subscription lifecycle methods
    // -------------------------------------------------------------------------

    async createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
        if (input.basePriceId) {
            // $250 base fee, qty always 1. ENTERPRISE only; base includes the first seat.
            lineItems.push({ price: input.basePriceId, quantity: 1 });
        }
        if (input.quantity > 0) {
            // $25 SEAT units: all seats (PRO) or seats beyond the base-included first (ENTERPRISE).
            // Omitted at 0 since Checkout rejects a quantity-0 line item.
            lineItems.push({
                price: input.seatPriceId,
                quantity: input.quantity,
            });
        }

        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: input.customerId,
            line_items: lineItems,
            subscription_data: {
                metadata: { companyId: input.companyId, plan: input.plan },
            },
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
        });

        if (!session.url) {
            throw new Error(
                'Stripe Checkout session did not return a redirect URL',
            );
        }
        return { checkoutUrl: session.url, subscriptionId: null };
    }

    async getSeatQuantity(ref: SubscriptionRef): Promise<number> {
        const item = await this.findSeatItem(ref.subscriptionId);
        // No SEAT line = solo ENTERPRISE (base covers the seat). PRO always has a SEAT line.
        return Math.max(item?.quantity ?? 0, 0);
    }

    async updateSeatQuantity(
        ref: SubscriptionRef,
        quantity: number,
        seatPriceId?: string,
    ): Promise<void> {
        const item = await this.findSeatItem(ref.subscriptionId);
        if (quantity <= 0) {
            // Drop to solo ENTERPRISE: delete the seat line (base still covers it). No-op if absent.
            // PRO never reaches 0, it floors at 1.
            if (item) {
                await this.stripe.subscriptionItems.del(item.id, {
                    proration_behavior: 'create_prorations',
                });
            }
            return;
        }
        if (item) {
            await this.stripe.subscriptionItems.update(item.id, {
                quantity,
                proration_behavior: 'create_prorations',
            });
            return;
        }
        // First extra seat on a previously solo ENTERPRISE sub: seat line doesn't exist yet, create it.
        if (!seatPriceId) {
            throw new Error(
                `Cannot add a seat to ${ref.subscriptionId}: no existing SEAT item and no seat price id supplied`,
            );
        }
        await this.stripe.subscriptionItems.create({
            subscription: ref.subscriptionId,
            price: seatPriceId,
            quantity,
            proration_behavior: 'create_prorations',
        });
    }

    async changePlan(input: ChangePlanInput): Promise<void> {
        const sub = (await this.stripe.subscriptions.retrieve(
            input.subscriptionId,
            {
                expand: ['items'],
            },
        )) as unknown as {
            metadata?: Record<string, string> | null;
            items: {
                data: {
                    id: string;
                    quantity?: number | null;
                    price: { metadata?: Record<string, string> };
                }[];
            };
        };

        if (!sub.items.data.length) {
            throw new Error(
                `Subscription ${input.subscriptionId} has no line items to change plan`,
            );
        }

        const currentBaseItem = sub.items.data.find(
            (i) => i.price?.metadata?.kind === 'ENTERPRISE_BASE',
        );
        // Prefer SEAT-metadata item; fall back to first non-base item for un-metadata'd (legacy) prices.
        const currentSeatItem =
            sub.items.data.find((i) => i.price?.metadata?.kind === 'SEAT') ??
            sub.items.data.find((i) => i !== currentBaseItem);
        const currentSeatQty = Math.max(currentSeatItem?.quantity ?? 0, 0);

        // Model A: PRO line = every seat, ENTERPRISE line = seats beyond base-covered first.
        // Switching keeps headcount but shifts the line by 1: PRO->ENTERPRISE drops it (base absorbs
        // a seat), ENTERPRISE->PRO raises it (base removed). Read the LIVE quantity, never a DB value.
        const toEnterprise = input.plan === 'ENTERPRISE';
        const newSeatQty = toEnterprise
            ? Math.max(currentSeatQty - 1, 0)
            : currentSeatQty + 1;

        const items: Stripe.SubscriptionUpdateParams.Item[] = [];

        // Seat line: update, create, or delete at quantity 0 (solo ENTERPRISE).
        if (newSeatQty <= 0) {
            if (currentSeatItem) {
                items.push({ id: currentSeatItem.id, deleted: true });
            }
        } else if (currentSeatItem) {
            items.push({
                id: currentSeatItem.id,
                price: input.seatPriceId,
                quantity: newSeatQty,
            });
        } else {
            items.push({ price: input.seatPriceId, quantity: newSeatQty });
        }

        // Base line: ENTERPRISE carries the $250 base, PRO does not.
        if (input.basePriceId) {
            // Add (PRO->ENTERPRISE) or update the existing base price.
            items.push(
                currentBaseItem
                    ? {
                          id: currentBaseItem.id,
                          price: input.basePriceId,
                          quantity: 1,
                      }
                    : { price: input.basePriceId, quantity: 1 },
            );
        } else if (currentBaseItem) {
            // ENTERPRISE->PRO: remove the base line item.
            items.push({ id: currentBaseItem.id, deleted: true });
        }

        await this.stripe.subscriptions.update(input.subscriptionId, {
            items,
            // Merge (never replace) so companyId etc survive; keeps deriveSubscriptionShape in sync.
            metadata: { ...(sub.metadata ?? {}), plan: input.plan },
            proration_behavior: 'create_prorations',
        });
    }

    async cancel(ref: SubscriptionRef): Promise<void> {
        await this.stripe.subscriptions.update(ref.subscriptionId, {
            cancel_at_period_end: true,
        });
    }

    async getCancellationState(
        ref: SubscriptionRef,
    ): Promise<{ cancelAtPeriodEnd: boolean; cancelAt: Date | null }> {
        const sub = (await this.stripe.subscriptions.retrieve(
            ref.subscriptionId,
            { expand: ['items'] },
        )) as unknown as StripeSubscriptionLike;
        // current_period_end lives on the line item on current API versions, so read it via the shared deriver.
        const { currentPeriodEnd } = deriveSubscriptionShape(sub);
        return {
            cancelAtPeriodEnd: sub.cancel_at_period_end === true,
            cancelAt: epochToDate(sub.cancel_at) ?? currentPeriodEnd,
        };
    }

    async resume(ref: SubscriptionRef): Promise<void> {
        await this.stripe.subscriptions.update(ref.subscriptionId, {
            cancel_at_period_end: false,
        });
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** SEAT ($25) line item, or null for a solo ENTERPRISE (base-only). Never fall back to the base item. */
    private async findSeatItem(
        subscriptionId: string,
    ): Promise<{ id: string; quantity?: number | null } | null> {
        const sub = (await this.stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items'],
        })) as unknown as {
            items: {
                data: {
                    id: string;
                    quantity?: number | null;
                    price?: { metadata?: Record<string, string> };
                }[];
            };
        };
        const item = sub.items.data.find(
            (i) => i.price?.metadata?.kind === 'SEAT',
        );
        return item ? { id: item.id, quantity: item.quantity } : null;
    }
}
