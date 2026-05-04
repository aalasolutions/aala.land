import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Locality } from './locality.entity';

@Entity('cities')
export class City {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ name: 'region_code', type: 'varchar', length: 50 })
    regionCode: string;

    @Column({ type: 'varchar', length: 2 })
    country: string;

    @OneToMany(() => Locality, (l) => l.city)
    localities: Locality[];

    @Column({ name: 'created_by_company_id', type: 'uuid' })
    createdByCompanyId: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
