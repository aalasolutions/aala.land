import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { City } from './city.entity';

@Entity('localities')
@Index('IDX_localities_city_normalized_name_unique', { synchronize: false })
@Index('IDX_localities_name_trgm', { synchronize: false })
export class Locality {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'city_id', type: 'uuid' })
  cityId: string;

  @ManyToOne(() => City, (c) => c.localities, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'city_id',
    foreignKeyConstraintName: 'FK_localities_city',
  })
  city: City;

  @Column({ name: 'created_by_company_id', type: 'uuid' })
  createdByCompanyId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
