import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Unit } from './unit.entity';
import { Asset } from './asset.entity';

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

    @Column({ name: 'thumbnail_url', type: 'varchar', length: 255, nullable: true })
    thumbnailUrl: string | null;

    @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
    fileName: string | null;

    @Column({ name: 's3_key', type: 'varchar', length: 500, nullable: true })
    s3Key: string | null;

    @Column({ name: 'content_type', type: 'varchar', length: 100, nullable: true })
    contentType: string | null;

    @Column({ name: 'file_size', type: 'integer', nullable: true })
    fileSize: number | null;

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

    @Column({ name: 'asset_id', type: 'uuid', nullable: true })
    assetId: string;

    @ManyToOne(() => Asset, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'asset_id' })
    asset: Asset;

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
