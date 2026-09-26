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
import { Contact } from '../../contacts/entities/contact.entity';
import { User } from '../../users/entities/user.entity';

// REQUEST: the agent asked. VERIFIED: the agent typed the stored phone. LINK: MANAGER+ attached the agent.
export enum ContactAccessKind {
  REQUEST = 'REQUEST',
  VERIFIED = 'VERIFIED',
  LINK = 'LINK',
}

export enum ContactAccessStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
}

export enum ContactAccessSourceType {
  LEAD = 'lead',
  UNIT = 'unit',
  CONTACT = 'contact',
}

// One row per grant or request; an APPROVED row that has not expired is what gives an agent FULL.
@Entity('contact_access_requests')
@Index('IDX_contact_access_company_status', ['companyId', 'status'])
@Index('IDX_contact_access_requester_status', ['requesterId', 'status'])
@Index('IDX_contact_access_contact', ['contactId'])
@Index('IDX_contact_access_region', ['regionCode'])
export class ContactAccessRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'company_id',
    foreignKeyConstraintName: 'FK_contact_access_company',
  })
  company: Company;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'contact_id',
    foreignKeyConstraintName: 'FK_contact_access_contact',
  })
  contact: Contact;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'requester_id',
    foreignKeyConstraintName: 'FK_contact_access_requester',
  })
  requester: User;

  // Copied from the contact at insert; approvers are scoped by it.
  @Column({ name: 'region_code', type: 'varchar', length: 50 })
  regionCode: string;

  @Column({ type: 'varchar', length: 16, default: ContactAccessKind.REQUEST })
  kind: ContactAccessKind;

  @Column({ type: 'varchar', length: 16, default: ContactAccessStatus.PENDING })
  status: ContactAccessStatus;

  @Column({ name: 'source_type', type: 'varchar', length: 50, nullable: true })
  sourceType: ContactAccessSourceType | null;

  // No FK: the lead or unit may be deleted while the grant lives on (D13).
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'decided_by',
    foreignKeyConstraintName: 'FK_contact_access_decided_by',
  })
  decider: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  // NULL means the grant never expires.
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
