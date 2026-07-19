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

/**
 * "Make it right" record (requirement 2.3): always anchored to one real
 * payment. Card rail: discount = provider customer-balance credit, refund =
 * provider refund (both inside stripe-billing.provider.ts). Manual rail: a
 * recorded obligation the operator settles outside the system. The 24-48h SLA
 * is process, not automation (ruling 10): status stays 'initiated'.
 */
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

  /** 'initiated' (provider call made / manual obligation open). */
  @Column({ type: 'varchar', length: 16, default: 'initiated' })
  status: string;

  @Column({ name: 'why_note', type: 'text' })
  whyNote: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'created_by_email', type: 'varchar', length: 255 })
  createdByEmail: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
