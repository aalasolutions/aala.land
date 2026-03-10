import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { PropertyArea } from '../../properties/entities/property-area.entity';
import { Unit } from '../../properties/entities/unit.entity';

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

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'property_id', type: 'uuid', nullable: true })
  propertyId: string;

  @ManyToOne(() => PropertyArea)
  @JoinColumn({ name: 'property_id' })
  property: PropertyArea;

  @Index()
  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

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

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({ name: 'property_interest', type: 'text', nullable: true })
  propertyInterest: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'budget_min', type: 'decimal', precision: 12, scale: 2, nullable: true })
  budgetMin: number;

  @Column({ name: 'budget_max', type: 'decimal', precision: 12, scale: 2, nullable: true })
  budgetMax: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
