import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum ChequeStatus {
  PENDING = 'PENDING',
  DEPOSITED = 'DEPOSITED',
  CLEARED = 'CLEARED',
  BOUNCED = 'BOUNCED',
  CANCELLED = 'CANCELLED',
  REPLACED = 'REPLACED',
}

export enum ChequeType {
  RENT = 'RENT',
  SECURITY_DEPOSIT = 'SECURITY_DEPOSIT',
  MAINTENANCE = 'MAINTENANCE',
  OTHER = 'OTHER',
}

@Entity('cheques')
export class Cheque {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'lease_id', type: 'uuid', nullable: true })
  leaseId: string | null;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string | null;

  @Column({ name: 'cheque_number', length: 100 })
  chequeNumber: string;

  @Column({ name: 'bank_name', length: 255 })
  bankName: string;

  @Column({ name: 'account_holder', length: 255 })
  accountHolder: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'AED' })
  currency: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ name: 'deposit_date', type: 'date', nullable: true })
  depositDate: Date | null;

  @Column({
    type: 'enum',
    enum: ChequeStatus,
    default: ChequeStatus.PENDING,
  })
  status: ChequeStatus;

  @Column({
    type: 'enum',
    enum: ChequeType,
    default: ChequeType.RENT,
  })
  type: ChequeType;

  @Column({ name: 'ocr_image_url', type: 'varchar', nullable: true })
  ocrImageUrl: string | null;

  @Column({ name: 'ocr_processed', type: 'boolean', default: false })
  ocrProcessed: boolean;

  @Column({ name: 'ocr_data', type: 'jsonb', nullable: true })
  ocrData: Record<string, unknown> | null;

  @Column({ name: 'bounce_count', type: 'int', default: 0 })
  bounceCount: number;

  @Column({ name: 'bounce_reason', type: 'varchar', length: 500, nullable: true })
  bounceReason: string | null;

  @Column({ name: 'last_bounce_date', type: 'timestamp', nullable: true })
  lastBounceDate: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
