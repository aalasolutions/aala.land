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
import { Asset } from './asset.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { User } from '../../users/entities/user.entity';
import { PropertyType } from './property-type.enum';

export enum UnitStatus {
  AVAILABLE = 'available',
  RENTED = 'rented',
  SOLD = 'sold',
  MAINTENANCE = 'maintenance',
}

@Entity('units')
@Index(
  'IDX_units_company_agent_active_rows',
  ['companyId', 'assignedAgentId'],
  {
    where: '"deleted_at" IS NULL',
  },
)
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_number', type: 'varchar', length: 50 })
  unitNumber: string;

  @Index('IDX_UNITS_ASSET_ID')
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.units)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  // A unit's owner is a contact, with at most one owner per unit (no co-ownership).
  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: Contact | null;

  // Assignment lives on the unit, not the person: owner and agent can differ
  @Column({ name: 'assigned_agent_id', type: 'uuid', nullable: true })
  assignedAgentId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_agent_id' })
  assignedAgent: User | null;

  @Column({
    type: 'enum',
    enum: UnitStatus,
    default: UnitStatus.AVAILABLE,
  })
  status: UnitStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price: number | null;

  @Column({
    name: 'sq_ft',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  sqFt: number | null;

  // Nullable means unknown; 0 is a genuine zero, ie. a studio.
  @Column({ type: 'integer', nullable: true })
  bedrooms: number | null;

  @Column({ type: 'integer', nullable: true })
  bathrooms: number | null;

  @Column({
    name: 'property_type',
    type: 'enum',
    enum: PropertyType,
    nullable: true,
  })
  propertyType: PropertyType | null;

  @Column({ type: 'jsonb', default: '[]' })
  amenities: string[];

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  floor: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  photos: string[];

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
