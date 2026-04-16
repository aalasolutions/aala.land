import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Unit } from './unit.entity';
import { Asset } from './asset.entity';

export enum DocumentCategory {
    LEASE = 'LEASE',
    EJARI = 'EJARI',
    TITLE_DEED = 'TITLE_DEED',
    ID_COPY = 'ID_COPY',
    NOC = 'NOC',
    INSURANCE = 'INSURANCE',
    MAINTENANCE = 'MAINTENANCE',
    INVOICE = 'INVOICE',
    RECEIPT = 'RECEIPT',
    OTHER = 'OTHER',
}

export enum DocumentAccessLevel {
    PUBLIC = 'PUBLIC',
    COMPANY = 'COMPANY',
    OWNER_ONLY = 'OWNER_ONLY',
    ADMIN_ONLY = 'ADMIN_ONLY',
}

@Entity('property_documents')
export class PropertyDocument {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 255 })
    url: string;

    @Column({ name: 'file_type', type: 'varchar', length: 50, nullable: true })
    fileType: string | null;

    @Column({ name: 'unit_id', type: 'uuid', nullable: true })
    unitId: string | null;

    @ManyToOne(() => Unit, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'unit_id' })
    unit: Unit;

    @Column({ name: 'building_id', type: 'uuid', nullable: true })
    assetId: string | null;

    @ManyToOne(() => Asset, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'building_id' })
    asset: Asset;

    @Column({ name: 'company_id', type: 'uuid' })
    companyId: string;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @Column({
        type: 'enum',
        enum: DocumentCategory,
        default: DocumentCategory.OTHER,
    })
    category: DocumentCategory;

    @Column({
        name: 'access_level',
        type: 'enum',
        enum: DocumentAccessLevel,
        default: DocumentAccessLevel.COMPANY,
    })
    accessLevel: DocumentAccessLevel;

    @Column({ type: 'int', default: 1 })
    version: number;

    @Column({ name: 'previous_version_id', type: 'uuid', nullable: true })
    previousVersionId: string | null;

    @ManyToOne(() => PropertyDocument, { nullable: true })
    @JoinColumn({ name: 'previous_version_id' })
    previousVersion: PropertyDocument | null;

    @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
    uploadedBy: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
