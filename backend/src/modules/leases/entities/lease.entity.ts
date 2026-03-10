import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum LeaseStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  RENEWED = 'RENEWED',
}

export enum LeaseType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
}

@Entity('leases')
export class Lease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'tenant_name', length: 255 })
  tenantName: string;

  @Column({ name: 'tenant_email', length: 255, nullable: true, type: 'varchar' })
  tenantEmail: string | null;

  @Column({ name: 'tenant_phone', length: 30, nullable: true, type: 'varchar' })
  tenantPhone: string | null;

  @Column({ name: 'tenant_national_id', length: 50, nullable: true, type: 'varchar' })
  tenantNationalId: string | null;

  @Column({
    type: 'enum',
    enum: LeaseType,
    default: LeaseType.RESIDENTIAL,
  })
  type: LeaseType;

  @Column({
    type: 'enum',
    enum: LeaseStatus,
    default: LeaseStatus.DRAFT,
  })
  status: LeaseStatus;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'monthly_rent', type: 'decimal', precision: 12, scale: 2 })
  monthlyRent: number;

  @Column({ type: 'varchar', length: 3, default: 'AED' })
  currency: string;

  @Column({ name: 'security_deposit', type: 'decimal', precision: 12, scale: 2, nullable: true })
  securityDeposit: number | null;

  @Column({ name: 'number_of_cheques', type: 'int', default: 1 })
  numberOfCheques: number;

  @Column({ name: 'ejari_number', length: 100, nullable: true, type: 'varchar' })
  ejariNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
