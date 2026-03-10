import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Lead } from '../../leads/entities/lead.entity';

export enum ContactType {
  LEAD = 'LEAD',
  TENANT = 'TENANT',
  OWNER = 'OWNER',
  VENDOR = 'VENDOR',
  OTHER = 'OTHER',
}

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

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string;

  @Column({ name: 'whatsapp_number', type: 'varchar', length: 50, nullable: true })
  whatsappNumber: string;

  @Column({
    type: 'enum',
    enum: ContactType,
    default: ContactType.OTHER,
  })
  type: ContactType;

  @Column({ name: 'contact_company', type: 'varchar', length: 200, nullable: true })
  contactCompany: string;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
