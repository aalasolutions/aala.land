import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Building } from './building.entity';
import { Owner } from '../../owners/entities/owner.entity';
import { PropertyType } from './property-type.enum';

export enum UnitStatus {
    AVAILABLE = 'available',
    RENTED = 'rented',
    SOLD = 'sold',
    MAINTENANCE = 'maintenance',
}

@Entity('units')
export class Unit {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'unit_number', type: 'varchar', length: 50 })
    unitNumber: string;

    @Column({ name: 'building_id', type: 'uuid' })
    buildingId: string;

    @ManyToOne(() => Building, (building) => building.units)
    @JoinColumn({ name: 'building_id' })
    building: Building;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @Index()
    @Column({ name: 'owner_id', type: 'uuid', nullable: true })
    ownerId: string;

    @ManyToOne(() => Owner, (owner) => owner.units)
    @JoinColumn({ name: 'owner_id' })
    owner: Owner;

    @Column({
        type: 'enum',
        enum: UnitStatus,
        default: UnitStatus.AVAILABLE,
    })
    status: UnitStatus;

    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    price: number;

    @Column({ name: 'sq_ft', type: 'decimal', precision: 10, scale: 2, nullable: true })
    sqFt: number;

    @Column({ type: 'integer', default: 0 })
    bedrooms: number;

    @Column({ type: 'integer', default: 0 })
    bathrooms: number;

    @Column({
        name: 'property_type',
        type: 'enum',
        enum: PropertyType,
        nullable: true,
    })
    propertyType: PropertyType | null;

    @Column({ type: 'jsonb', default: '[]' })
    amenities: string[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
