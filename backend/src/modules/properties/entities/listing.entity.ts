import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Unit } from './unit.entity';

export enum ListingStatus {
    DRAFT = 'DRAFT',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    CLOSED = 'CLOSED',
}

export enum ListingType {
    RENT = 'RENT',
    SALE = 'SALE',
}

@Entity('listings')
export class Listing {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'unit_id', type: 'uuid' })
    unitId: string;

    @ManyToOne(() => Unit)
    @JoinColumn({ name: 'unit_id' })
    unit: Unit;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    price: number;

    @Column({ type: 'enum', enum: ListingType, default: ListingType.RENT })
    type: ListingType;

    @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.DRAFT })
    status: ListingStatus;

    @Column({ type: 'jsonb', default: '[]' })
    photos: string[];

    @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
    contactPhone: string;

    @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
    contactEmail: string;

    @Column({ name: 'featured', type: 'boolean', default: false })
    featured: boolean;

    @Column({ name: 'views_count', type: 'int', default: 0 })
    viewsCount: number;

    @Column({ name: 'inquiries_count', type: 'int', default: 0 })
    inquiriesCount: number;

    @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
    publishedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
