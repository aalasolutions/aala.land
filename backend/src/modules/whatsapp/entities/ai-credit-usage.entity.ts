import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Do NOT add user_id here: the allowance check locks this single row, and a
// per-agent split turns it into a SUM that cannot be locked atomically.
// Per-agent numbers come from whatsapp_ai_conversations.
@Entity('ai_credit_usage')
@Index('UQ_ai_credit_usage_company_period', ['companyId', 'periodStart'], {
  unique: true,
})
export class AiCreditUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd: Date;

  @Column({ name: 'credits_used', type: 'int', default: 0 })
  creditsUsed: number;

  @Column({
    name: 'exhausted_notified_at',
    type: 'timestamptz',
    nullable: true,
  })
  exhaustedNotifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
