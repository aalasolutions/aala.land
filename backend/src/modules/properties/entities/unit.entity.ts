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
import { UnitSubType } from './unit-sub-type.enum';

export enum UnitStatus {
  AVAILABLE = 'available',
  RENTED = 'rented',
  SOLD = 'sold',
  MAINTENANCE = 'maintenance',
}

export const MAX_BATHROOMS = 99;

@Entity('units')
@Index('IDX_units_amenities', { synchronize: false })
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
  @JoinColumn({
    name: 'asset_id',
    foreignKeyConstraintName: 'FK_173b4aee6c28c4db7e929760d80',
  })
  asset: Asset;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index('IDX_UNITS_OWNER_ID')
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  // A unit's owner is a contact, with at most one owner per unit (no co-ownership).
  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'fk_units_owner' })
  owner: Contact | null;

  // Assignment lives on the unit, not the person: owner and agent can differ
  @Column({ name: 'assigned_agent_id', type: 'uuid', nullable: true })
  assignedAgentId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'assigned_agent_id',
    foreignKeyConstraintName: 'fk_units_assigned_agent',
  })
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

  // Half steps (2.5) cover a bathroom without a shower or tub; numeric(3,1) caps it below 100.
  @Column({
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  bathrooms: number | null;

  @Column({
    name: 'property_type',
    type: 'enum',
    enum: PropertyType,
    nullable: true,
  })
  propertyType: PropertyType | null;

  @Column({ name: 'sub_type', type: 'enum', enum: UnitSubType })
  subType: UnitSubType;

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
