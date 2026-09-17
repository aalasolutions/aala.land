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

// Single place identity lives; roles derive from referencing rows, never stored here.
@Entity('contacts')
@Index('IDX_contacts_company_created_by', ['companyId', 'createdBy'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_contacts_company_id')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'company_id',
    foreignKeyConstraintName: 'FK_contacts_company',
  })
  company: Company;

  // Nullable: an inbound WhatsApp contact may have a number, no name; UI falls back to the number.
  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  // Whether phone is reachable on WhatsApp; replaces whatsapp_number, almost always one number.
  @Column({
    name: 'is_whatsapp',
    type: 'boolean',
    default: false,
  })
  isWhatsapp: boolean;

  // Free-text; no nationalities lookup table exists.
  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  // Stored plain: the same number already sits in attached document scans, encrypting buys nothing.
  @Column({ name: 'national_id', type: 'varchar', length: 50, nullable: true })
  nationalId: string | null;

  @Column({
    name: 'contact_company',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  contactCompany: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index('IDX_CONTACTS_REGION_CODE')
  @Column({ name: 'region_code', type: 'varchar', length: 50 })
  regionCode: string;

  @Index('IDX_contacts_created_by')
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
