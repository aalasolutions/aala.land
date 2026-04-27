import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { City } from './city.entity';

@Entity('localities')
export class Locality {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ name: 'city_id', type: 'uuid' })
    cityId: string;

    @ManyToOne(() => City, (c) => c.localities)
    @JoinColumn({ name: 'city_id' })
    city: City;

    @Column({ name: 'created_by_company_id', type: 'uuid' })
    createdByCompanyId: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
