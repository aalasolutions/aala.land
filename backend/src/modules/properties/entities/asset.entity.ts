import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Locality } from '../../locations/entities/locality.entity';
import { Unit } from './unit.entity';

@Entity('assets')
@Index('IDX_assets_locality_normalized_name_unique', { synchronize: false })
@Index('IDX_assets_name_trgm', { synchronize: false })
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'locality_id', type: 'uuid' })
  localityId: string;

  @ManyToOne(() => Locality)
  @JoinColumn({
    name: 'locality_id',
    foreignKeyConstraintName: 'FK_assets_locality',
  })
  locality: Locality;

  @Column({ name: 'company_id', type: 'uuid' })
  createdByCompanyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({
    name: 'company_id',
    foreignKeyConstraintName: 'FK_5eba2a0d7830341f2c8d0394d3d',
  })
  company: Company;

  @OneToMany(() => Unit, (unit) => unit.asset)
  units: Unit[];

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
