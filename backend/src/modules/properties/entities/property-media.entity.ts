import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Unit } from './unit.entity';
import { Building } from './building.entity';

export enum MediaType {
    IMAGE = 'image',
    VIDEO = 'video',
    VIRTUAL_TOUR = 'virtual_tour',
}

@Entity('property_media')
export class PropertyMedia {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    url: string;

    @Column({
        type: 'enum',
        enum: MediaType,
        default: MediaType.IMAGE,
    })
    type: MediaType;

    @Column({ name: 'is_primary', type: 'boolean', default: false })
    isPrimary: boolean;

    @Column({ name: 'unit_id', type: 'uuid', nullable: true })
    unitId: string;

    @ManyToOne(() => Unit, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'unit_id' })
    unit: Unit;

    @Column({ name: 'building_id', type: 'uuid', nullable: true })
    buildingId: string;

    @ManyToOne(() => Building, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'building_id' })
    building: Building;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
