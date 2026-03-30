import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Locality } from '../../locations/entities/locality.entity';
import { Unit } from './unit.entity';
import { PropertyType } from './property-type.enum';

@Entity('buildings')
export class Building {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ name: 'locality_id', type: 'uuid' })
    localityId: string;

    @ManyToOne(() => Locality)
    @JoinColumn({ name: 'locality_id' })
    locality: Locality;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @OneToMany(() => Unit, (unit) => unit.building)
    units: Unit[];

    @Column({ type: 'text', nullable: true })
    address: string | null;

    @Column({
        name: 'property_type',
        type: 'enum',
        enum: PropertyType,
        default: PropertyType.RENTAL,
    })
    propertyType: PropertyType;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
