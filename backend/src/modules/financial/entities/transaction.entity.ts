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

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'INCOME',
  })
  type: string;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'OTHER',
    nullable: true,
  })
  category: string;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'PENDING',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'AED' })
  currency: string;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 100,
    default: 'CASH',
    nullable: true,
  })
  paymentMethod: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceNumber: string;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string;

  @ManyToOne(() => Unit)
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'transaction_date', type: 'date', nullable: true })
  transactionDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
