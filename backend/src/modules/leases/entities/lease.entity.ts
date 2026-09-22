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
import { Contact } from '../../contacts/entities/contact.entity';

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
@Index('IDX_leases_company_active_rows', ['companyId'], {
  where: '"deleted_at" IS NULL',
})
@Index('UQ_leases_active_unit', ['unitId'], {
  unique: true,
  where: `"status" = 'ACTIVE'`,
})
export class Lease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index('IDX_LEASES_UNIT_ID')
  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @ManyToOne(() => Unit)
  @JoinColumn({ name: 'unit_id', foreignKeyConstraintName: 'FK_leases_unit' })
  unit: Unit;

  // The tenant is a contact; identity and national ID live there, not on the lease.
  @Index('IDX_LEASES_CONTACT_ID')
  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'contact_id',
    foreignKeyConstraintName: 'fk_leases_contact',
  })
  contact: Contact | null;

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
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'monthly_rent', type: 'decimal', precision: 12, scale: 2 })
  monthlyRent: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({
    name: 'security_deposit',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  securityDeposit: number | null;

  @Column({ name: 'number_of_cheques', type: 'int', default: 1 })
  numberOfCheques: number;

  @Column({
    name: 'tenancy_registration_ref',
    length: 100,
    nullable: true,
    type: 'varchar',
  })
  tenancyRegistrationRef: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Archive marker; filtered explicitly.
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
