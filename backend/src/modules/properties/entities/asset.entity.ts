import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Locality } from '../../locations/entities/locality.entity';
import { Unit } from './unit.entity';

@Entity('assets')
export class Asset {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ name: 'locality_id', type: 'uuid' })
    localityId: string;

    @ManyToOne(() => Locality)
    @JoinColumn({ name: 'locality_id' })
    locality: Locality;

    @Column({ name: 'created_by_company_id', type: 'uuid' })
    createdByCompanyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'created_by_company_id' })
    company: Company;

    @OneToMany(() => Unit, (unit) => unit.asset)
    units: Unit[];

    @Column({ type: 'text', nullable: true })
    address: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
