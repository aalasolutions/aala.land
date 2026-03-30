import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { Transaction } from '../../financial/entities/transaction.entity';

export enum CommissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum CommissionType {
  SALE = 'SALE',
  RENTAL = 'RENTAL',
  REFERRAL = 'REFERRAL',
}

@Entity('commissions')
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'agent_id' })
  agent: User;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead | null;

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction | null;

  @Column({
    type: 'enum',
    enum: CommissionType,
    default: CommissionType.SALE,
  })
  type: CommissionType;

  @Column({
    type: 'enum',
    enum: CommissionStatus,
    default: CommissionStatus.PENDING,
  })
  status: CommissionStatus;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 12, scale: 2 })
  grossAmount: number;

  @Column({ name: 'commission_rate', type: 'decimal', precision: 5, scale: 2 })
  commissionRate: number;

  @Column({ name: 'commission_amount', type: 'decimal', precision: 12, scale: 2 })
  commissionAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'AED' })
  currency: string;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'region_code', type: 'varchar', length: 50 })
  regionCode: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
