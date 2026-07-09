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
import { Owner } from '../../owners/entities/owner.entity';

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_number', type: 'varchar', length: 50 })
  unitNumber: string;

  @Column({ name: 'building_id', type: 'uuid' })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.units)
  @JoinColumn({ name: 'building_id' })
  asset: Asset;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => Owner, (owner) => owner.units, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner | null;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'available',
  })
  status: string;

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

  @Column({ type: 'integer', default: 0 })
  bedrooms: number;

  @Column({ type: 'integer', default: 0 })
  bathrooms: number;

  @Column({
    name: 'property_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  propertyType: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  amenities: string[];

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  floor: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  photos: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
