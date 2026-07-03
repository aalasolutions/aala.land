import type { BillingPlan } from '../provider/billing-provider.interface';

/** The seven normalized billing event names. FROZEN by the billing contract
 *  (section 7). Adding, trimming, or merging names requires a contract revision. */
export type BillingEventName =
    | 'SubscriptionActivated'
    | 'SubscriptionUpdated'
    | 'SeatQuantityChanged'
    | 'PlanChanged'
    | 'SubscriptionCanceled'
    | 'PaymentSucceeded'
    | 'PaymentFailed';

export interface BillingEventBase {
    name: BillingEventName;
    /** Resolved from provider metadata or a provider customer lookup. */
    companyId: string;
    customerId: string;
    subscriptionId: string | null;
    occurredAt: Date;
}

export interface SubscriptionActivatedEvent extends BillingEventBase {
    name: 'SubscriptionActivated';
    plan: BillingPlan;
    quantity: number;
    /** Provider-native status string, stored raw in billing_status. */
    status: string;
    currentPeriodEnd: Date | null;
}

export interface SubscriptionUpdatedEvent extends BillingEventBase {
    name: 'SubscriptionUpdated';
    plan: BillingPlan;
    quantity: number;
    status: string;
    currentPeriodEnd: Date | null;
}

export interface SeatQuantityChangedEvent extends BillingEventBase {
    name: 'SeatQuantityChanged';
    /** Absolute new seat quantity, never a delta. */
    quantity: number;
}

export interface PlanChangedEvent extends BillingEventBase {
    name: 'PlanChanged';
    plan: BillingPlan;
    quantity: number;
}

export interface SubscriptionCanceledEvent extends BillingEventBase {
    name: 'SubscriptionCanceled';
    endedAt: Date | null;
}

export interface PaymentSucceededEvent extends BillingEventBase {
    name: 'PaymentSucceeded';
    /** Minor units (cents / fils / halalas). */
    amount: number;
    /** Lowercase ISO 4217. */
    currency: string;
    invoiceId: string | null;
}

export interface PaymentFailedEvent extends BillingEventBase {
    name: 'PaymentFailed';
    amount: number;
    currency: string;
    invoiceId: string | null;
    attemptCount: number | null;
}

export type NormalizedBillingEvent =
    | SubscriptionActivatedEvent
    | SubscriptionUpdatedEvent
    | SeatQuantityChangedEvent
    | PlanChangedEvent
    | SubscriptionCanceledEvent
    | PaymentSucceededEvent
    | PaymentFailedEvent;
