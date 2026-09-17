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
import { Locality } from '../../locations/entities/locality.entity';
import { City } from '../../locations/entities/city.entity';
import { Unit } from '../../properties/entities/unit.entity';
import { User } from '../../users/entities/user.entity';
import { Contact } from '../../contacts/entities/contact.entity';

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  VIEWING = 'VIEWING',
  NEGOTIATING = 'NEGOTIATING',
  WON = 'WON',
  LOST = 'LOST',
}

export enum LeadTemperature {
  HOT = 'HOT',
  WARM = 'WARM',
  COLD = 'COLD',
  DEAD = 'DEAD',
}

export enum LeadSource {
  WEBSITE = 'WEBSITE',
  WHATSAPP = 'WHATSAPP',
  REFERRAL = 'REFERRAL',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  WALK_IN = 'WALK_IN',
  OTHER = 'OTHER',
}

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_LEADS_COMPANY_ID')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  // One lead per property: a contact interested in three properties creates three lead rows.
  @Index('IDX_LEADS_CONTACT_ID')
  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'contact_id',
    foreignKeyConstraintName: 'fk_leads_contact',
  })
  contact: Contact | null;

  @Index('IDX_LEADS_LOCALITY_ID')
  @Column({ name: 'locality_id', type: 'uuid', nullable: true })
  localityId: string | null;

  @ManyToOne(() => Locality, { nullable: true })
  @JoinColumn({
    name: 'locality_id',
    foreignKeyConstraintName: 'fk_leads_locality',
  })
  locality: Locality | null;

  // City is above locality: a lead can name a city but no area (region, city, locality, unit).
  @Index('IDX_LEADS_CITY_ID')
  @Column({ name: 'city_id', type: 'uuid', nullable: true })
  cityId: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'city_id', foreignKeyConstraintName: 'fk_leads_city' })
  city: City | null;

  @Index('IDX_LEADS_UNIT_ID')
  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string | null;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'unit_id', foreignKeyConstraintName: 'fk_leads_unit' })
  unit: Unit | null;

  @Column({
    type: 'enum',
    enum: LeadStatus,
    default: LeadStatus.NEW,
  })
  status: LeadStatus;

  @Column({
    type: 'enum',
    enum: LeadTemperature,
    default: LeadTemperature.WARM,
  })
  temperature: LeadTemperature;

  @Column({
    type: 'enum',
    enum: LeadSource,
    default: LeadSource.OTHER,
  })
  source: LeadSource;

  @Column({ type: 'integer', default: 0 })
  score: number;

  @Index('IDX_LEADS_ASSIGNED_TO')
  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({
    name: 'assigned_to',
    foreignKeyConstraintName: 'FK_leads_assigned_to',
  })
  assignedAgent: User | null;

  @Column({ name: 'property_interest', type: 'text', nullable: true })
  propertyInterest: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    name: 'budget_min',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  budgetMin: number | null;

  @Column({
    name: 'budget_max',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  budgetMax: number | null;

  @Column({ name: 'stage_entered_at', type: 'timestamptz', nullable: true })
  stageEnteredAt: Date | null;

  @Column({
    name: 'transfer_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  transferReason: string | null;

  @Column({ name: 'previous_agent', type: 'uuid', nullable: true })
  previousAgent: string | null;

  @Index('IDX_LEADS_REGION_CODE')
  @Column({ name: 'region_code', type: 'varchar', length: 50 })
  regionCode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
