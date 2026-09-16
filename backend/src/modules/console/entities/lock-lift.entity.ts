import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Re-lock is automatic, read-time evaluated, no scheduler; rows are never deleted, kept in History.
@Entity('lock_lifts')
export class LockLift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_lock_lifts_company')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'lift_until', type: 'timestamptz' })
  liftUntil: Date;

  @Column({ name: 'granted_by', type: 'uuid' })
  grantedBy: string;

  @Column({ name: 'granted_by_email', type: 'varchar', length: 255 })
  grantedByEmail: string;

  /** Set by "End lift now"; NULL while the lift can still apply. */
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'ended_by', type: 'uuid', nullable: true })
  endedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
