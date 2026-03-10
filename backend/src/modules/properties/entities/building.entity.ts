import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { PropertyArea } from './property-area.entity';
import { Unit } from './unit.entity';
import { PropertyType } from './property-type.enum';

@Entity('buildings')
export class Building {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ name: 'area_id', type: 'uuid' })
    areaId: string;

    @ManyToOne(() => PropertyArea, (area) => area.buildings)
    @JoinColumn({ name: 'area_id' })
    area: PropertyArea;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @OneToMany(() => Unit, (unit) => unit.building)
    units: Unit[];

    @Column({ type: 'text', nullable: true })
    address: string;

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
