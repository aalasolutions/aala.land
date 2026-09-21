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
import { Unit } from '../../properties/entities/unit.entity';

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum TransactionCategory {
  RENT = 'RENT',
  SALE = 'SALE',
  DEPOSIT = 'DEPOSIT',
  MAINTENANCE = 'MAINTENANCE',
  COMMISSION = 'COMMISSION',
  OTHER = 'OTHER',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CHEQUE = 'CHEQUE',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
  ONLINE = 'ONLINE',
}

@Entity('transactions')
@Index('IDX_TRANSACTIONS_COMPANY_TRANSACTION_DATE', [
  'companyId',
  'transactionDate',
])
@Index('IDX_TRANSACTIONS_COMPANY_CREATED_AT', ['companyId', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Covered by the leading column of IDX_TRANSACTIONS_COMPANY_TRANSACTION_DATE.
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.INCOME,
  })
  type: TransactionType;

  @Index('IDX_TRANSACTIONS_CATEGORY')
  @Column({
    type: 'enum',
    enum: TransactionCategory,
    default: TransactionCategory.OTHER,
    nullable: true,
  })
  category: TransactionCategory;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'AED' })
  currency: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
    nullable: true,
  })
  paymentMethod: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceNumber: string;

  @Index('IDX_TRANSACTIONS_REGION_CODE')
  @Column({ name: 'region_code', type: 'varchar', length: 50, nullable: true })
  regionCode: string | null;

  @Index('IDX_TRANSACTIONS_UNIT_ID')
  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string;

  @ManyToOne(() => Unit)
  @JoinColumn({
    name: 'unit_id',
    foreignKeyConstraintName: 'FK_transactions_unit',
  })
  unit: Unit;

  // The day the money arrived. Required once the row is COMPLETED, empty while PENDING.
  @Column({ name: 'transaction_date', type: 'date', nullable: true })
  transactionDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
