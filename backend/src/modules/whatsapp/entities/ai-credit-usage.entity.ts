import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// No user_id: a per-agent split would turn the locked allowance check into an unlockable SUM
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
