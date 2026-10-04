import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type BillingHistoryType =
  | 'payment_succeeded'
  | 'payment_failed'
  | 'settled_without_charge'
  | 'refund';

export type BillingRefundStatus = 'pending' | 'approved' | 'rejected';

/** Keys on (provider_invoice_id, type), not event id; a refund row keys on the refund id. */
@Entity('billing_history')
@Index('UQ_billing_history_invoice_type', ['providerInvoiceId', 'type'], {
  unique: true,
})
@Index('IDX_billing_history_company_occurred', ['companyId', 'occurredAt'])
@Index('IDX_billing_history_occurred', ['occurredAt'])
export class BillingHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** Provider invoice id, or the refund id on a refund row. Part of the idempotency key. */
  @Column({ name: 'provider_invoice_id', type: 'varchar', length: 255 })
  providerInvoiceId: string;

  @Column({ type: 'varchar', length: 32 })
  type: BillingHistoryType;

  /** Minor units: amount_paid on success, amount_due on failure, amount returned on refund. */
  @Column({ type: 'integer' })
  amount: number;

  /** Minor units of credit used to pay this invoice. */
  @Column({ name: 'credit_applied', type: 'integer', default: 0 })
  creditApplied: number;

  /** Minor units of credit added by this transaction. */
  @Column({ name: 'credit_issued', type: 'integer', default: 0 })
  creditIssued: number;

  /** Provider's raw reason for the transaction. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  origin: string | null;

  /** Lowercase ISO 4217. */
  @Column({ type: 'varchar', length: 3 })
  currency: string;

  /** Provider hosted invoice page; the "view / download" link. Null if the provider omitted it. */
  @Column({ name: 'hosted_invoice_url', type: 'text', nullable: true })
  hostedInvoiceUrl: string | null;

  /** Provider-generated PDF link. Null if the provider omitted it. */
  @Column({ name: 'invoice_pdf_url', type: 'text', nullable: true })
  invoicePdfUrl: string | null;

  @Column({ name: 'period_start', type: 'timestamptz', nullable: true })
  periodStart: Date | null;

  @Column({ name: 'period_end', type: 'timestamptz', nullable: true })
  periodEnd: Date | null;

  /** Refund rows only; null for every other type. */
  @Column({
    name: 'refund_status',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  refundStatus: BillingRefundStatus | null;

  /** Provider dunning attempt count; only meaningful for failures. */
  @Column({ name: 'attempt_count', type: 'integer', nullable: true })
  attemptCount: number | null;

  /** When the payment event occurred at the provider. */
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
