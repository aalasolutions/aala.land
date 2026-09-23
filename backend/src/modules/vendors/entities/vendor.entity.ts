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

export enum VendorSpecialty {
  PLUMBING = 'PLUMBING',
  ELECTRICAL = 'ELECTRICAL',
  HVAC = 'HVAC',
  STRUCTURAL = 'STRUCTURAL',
  CLEANING = 'CLEANING',
  PEST_CONTROL = 'PEST_CONTROL',
  APPLIANCE = 'APPLIANCE',
  PAINTING = 'PAINTING',
  GENERAL = 'GENERAL',
}

@Entity('vendors')
export class Vendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_vendors_company_id')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'company_id',
    foreignKeyConstraintName: 'FK_vendors_company',
  })
  company: Company;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  specialties: VendorSpecialty[];

  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyName: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  rating: number | null;

  @Column({
    name: 'hourly_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  hourlyRate: number | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index('IDX_VENDORS_REGION_CODE')
  @Column({ name: 'region_code', type: 'varchar', length: 50 })
  regionCode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
