import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A payment received OUTSIDE the card gateway (requirement 2.4): bank transfer,
 * JazzCash, wire, cash. First-class rail, any currency, recorded in its own
 * currency with no FX (ruling 11). At least one of notes/receipt is required
 * ("DOCUMENT IT"), enforced in the service.
 */
@Entity('manual_payments')
@Index('IDX_manual_payments_company_covers', ['companyId', 'coversEnd'])
export class ManualPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_manual_payments_company')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** Minor units in the payment currency. */
  @Column({
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => Number(v ?? '0'),
    },
  })
  amount: number;

  /** Lowercase ISO 4217; PKR stays PKR. */
  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ name: 'received_at', type: 'date' })
  receivedAt: string;

  /** Billing period this payment pays for; drives Upcoming manual payments + MRR. */
  @Column({ name: 'covers_start', type: 'date' })
  coversStart: string;

  @Index('IDX_manual_payments_covers_end')
  @Column({ name: 'covers_end', type: 'date' })
  coversEnd: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** S3 key in the private documents bucket; streamed back via the console. */
  @Column({ name: 'receipt_key', type: 'varchar', length: 512, nullable: true })
  receiptKey: string | null;

  /** Receipt content type, persisted at upload so the stream renders inline. */
  @Column({ name: 'receipt_mime', type: 'varchar', length: 64, nullable: true })
  receiptMime: string | null;

  @Column({ name: 'recorded_by', type: 'uuid' })
  recordedBy: string;

  @Column({ name: 'recorded_by_email', type: 'varchar', length: 255 })
  recordedByEmail: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
