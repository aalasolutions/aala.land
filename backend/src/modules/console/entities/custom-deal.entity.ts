import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DealBasis = 'per_seat' | 'total_month';

/**
 * Per-company hand-shaken pricing arrangement (operator console, requirement 2.2).
 * One ACTIVE deal per company (partial unique index where ended_at IS NULL).
 * Expiry never drops the tier; it write-locks the account (ruling 9), evaluated
 * at read time by LockStateService.
 */
@Entity('custom_deals')
@Index('UQ_custom_deals_active_company', ['companyId'], {
  unique: true,
  where: '"ended_at" IS NULL',
})
export class CustomDeal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_custom_deals_company')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** Minor units in the deal currency (PKR 1000 = 100000). No FX (ruling 11). */
  @Column({
    name: 'price_amount',
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => Number(v ?? '0'),
    },
  })
  priceAmount: number;

  /** Lowercase ISO 4217. Any currency; PKR stays PKR. */
  @Column({ type: 'varchar', length: 3 })
  currency: string;

  /** per_seat: priceAmount per seat. total_month: priceAmount for the whole team. */
  @Column({ type: 'varchar', length: 16 })
  basis: DealBasis;

  /** Ruling 4: every deal carries a seat cap, no exceptions. */
  @Column({ name: 'seat_cap', type: 'int' })
  seatCap: number;

  /** Null = lifetime deal (no expiry, never locks). */
  @Column({ name: 'until_date', type: 'timestamptz', nullable: true })
  untilDate: Date | null;

  /** Ruling 3: the institutional memory. Why they pay what they pay. */
  @Column({ name: 'why_note', type: 'text' })
  whyNote: string;

  @Column({ name: 'granted_by', type: 'uuid' })
  grantedBy: string;

  /** Snapshot so the deal card survives operator-account changes. */
  @Column({ name: 'granted_by_email', type: 'varchar', length: 255 })
  grantedByEmail: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({
    name: 'updated_by_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  updatedByEmail: string | null;

  /** Set when the deal is ended early; NULL = the active deal. */
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'ended_by', type: 'uuid', nullable: true })
  endedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
