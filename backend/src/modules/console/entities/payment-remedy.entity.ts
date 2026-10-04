import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type RemedyKind = 'discount_next_bill' | 'refund';
export type RemedyScope = 'partial' | 'full';
export type RemedySource = 'card' | 'manual';
export type RemedyCause = 'make_it_right' | 'cancel';
/** queued: planned, not sent; failed: given up after retries; the rest follow the provider. */
export type RemedyStatus =
  | 'queued'
  | 'initiated'
  | 'approved'
  | 'rejected'
  | 'reversed'
  | 'failed';

// Manual rail stays 'initiated': settlement is a process, not an automated status transition.
@Entity('payment_remedies')
export class PaymentRemedy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_payment_remedies_company')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 24 })
  kind: RemedyKind;

  /** Refund only: partial or full. Null for a next-bill discount. */
  @Column({ name: 'refund_scope', type: 'varchar', length: 8, nullable: true })
  refundScope: RemedyScope | null;

  /** Minor units in the anchored payment's currency. */
  @Column({
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => Number(v ?? '0'),
    },
  })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ name: 'payment_source', type: 'varchar', length: 8 })
  paymentSource: RemedySource;

  /** Anchor for card-rail remedies (billing_history row). */
  @Column({ name: 'billing_history_id', type: 'uuid', nullable: true })
  billingHistoryId: string | null;

  /** Provider id of the refunded card payment; keys a refund before its history row exists. */
  @Column({
    name: 'provider_invoice_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerInvoiceId: string | null;

  /** Anchor for manual-rail remedies. */
  @Column({ name: 'manual_payment_id', type: 'uuid', nullable: true })
  manualPaymentId: string | null;

  /** Provider-side reference (refund id / balance transaction id), card rail only. */
  @Column({
    name: 'provider_ref',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerRef: string | null;

  @Column({ type: 'varchar', length: 16, default: 'initiated' })
  status: RemedyStatus;

  /** make_it_right: an operator remedy; cancel: the refund of unused days on downgrade. */
  @Column({ type: 'varchar', length: 16, default: 'make_it_right' })
  cause: RemedyCause;

  @Column({ name: 'why_note', type: 'text' })
  whyNote: string;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  /** How a system-computed amount was reached; null for operator remedies. */
  @Column({ type: 'jsonb', nullable: true })
  breakdown: Record<string, unknown> | null;

  /** Null when the system created the remedy. */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    name: 'created_by_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdByEmail: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
