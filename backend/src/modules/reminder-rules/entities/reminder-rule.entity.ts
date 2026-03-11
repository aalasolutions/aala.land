import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum ReminderRuleType {
  RENT_DUE = 'RENT_DUE',
  LEASE_EXPIRY = 'LEASE_EXPIRY',
  MAINTENANCE_SCHEDULE = 'MAINTENANCE_SCHEDULE',
  CHEQUE_DUE = 'CHEQUE_DUE',
  CUSTOM = 'CUSTOM',
}

@Entity('reminder_rules')
export class ReminderRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: ReminderRuleType, default: ReminderRuleType.CUSTOM })
  type: ReminderRuleType;

  @Column({ name: 'trigger_days_before', type: 'int' })
  triggerDaysBefore: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
