import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';

export type BillingHistoryType = 'payment_succeeded' | 'payment_failed';

/**
 * Append-style record of subscription payment outcomes, sourced from Stripe
 * invoice webhooks. Additive to the billing model: this table is NOT one of the
 * single-writer company columns (purchasedSeats/billingStatus/billingSubscriptionId).
 *
 * Idempotency key is (stripe_invoice_id, type), NOT the Stripe event id, because a
 * single successful payment fires BOTH invoice.paid AND invoice.payment_succeeded
 * (two event ids, one invoice); recording per event id would double-count. The
 * unique index lets recordPayment() upsert (latest-event-wins), which also collapses
 * dunning retries and survives webhook re-dispatch.
 */
@Entity('billing_history')
@Index('UQ_billing_history_invoice_type', ['stripeInvoiceId', 'type'], { unique: true })
@Index('IDX_billing_history_company_occurred', ['companyId', 'occurredAt'])
export class BillingHistory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    /** Stripe invoice id (in_...). Part of the idempotency key. */
    @Column({ name: 'stripe_invoice_id', type: 'varchar', length: 255 })
    stripeInvoiceId: string;

    @Column({ type: 'varchar', length: 32 })
    type: BillingHistoryType;

    /** Minor units (cents / fils / halalas): amount_paid on success, amount_due on failure. */
    @Column({ type: 'integer' })
    amount: number;

    /** Lowercase ISO 4217. */
    @Column({ type: 'varchar', length: 3 })
    currency: string;

    /** Stripe hosted invoice page; the "view / download" link. Null if Stripe omitted it. */
    @Column({ name: 'hosted_invoice_url', type: 'text', nullable: true })
    hostedInvoiceUrl: string | null;

    /** Stripe-generated PDF link. Null if Stripe omitted it. */
    @Column({ name: 'invoice_pdf_url', type: 'text', nullable: true })
    invoicePdfUrl: string | null;

    @Column({ name: 'period_start', type: 'timestamptz', nullable: true })
    periodStart: Date | null;

    @Column({ name: 'period_end', type: 'timestamptz', nullable: true })
    periodEnd: Date | null;

    /** Stripe dunning attempt count; only meaningful for failures. */
    @Column({ name: 'attempt_count', type: 'integer', nullable: true })
    attemptCount: number | null;

    /** When the payment event occurred at Stripe (event.created). */
    @Column({ name: 'occurred_at', type: 'timestamptz' })
    occurredAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
