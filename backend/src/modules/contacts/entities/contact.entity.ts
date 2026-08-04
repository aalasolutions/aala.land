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

// Contacts is the single place a person's identity lives. Roles (Lead, Tenant,
// Owner, Vendor) are DERIVED from which rows reference the contact, never stored
// here. See .claude/memory/PLAN_CONTACTS_DOMAIN.md.
@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  // Nullable: a contact created from an inbound WhatsApp message may have a
  // number and no name. The UI falls back to the number for display.
  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  // Whether `phone` is reachable on WhatsApp. One number field, not two: the
  // old whatsapp_number column duplicated what is nearly always one number.
  @Column({
    name: 'is_whatsapp',
    type: 'boolean',
    default: false,
  })
  isWhatsapp: boolean;

  // Free-text nationality (no nationalities lookup table exists). Renamed from
  // owners.nationality_id, which was a varchar despite the _id suffix.
  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  // The ID document number (EID / passport). Absorbed from leases' flat
  // tenant_national_id string. Stored plain; the same number already sits in
  // attached document scans, so encrypting one varchar buys nothing.
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

  @Index('IDX_contacts_created_by')
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
