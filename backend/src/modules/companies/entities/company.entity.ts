import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum SubscriptionTier {
    FREE = 'FREE',
    STARTER = 'STARTER',
    GROWTH = 'GROWTH',
    SCALE = 'SCALE',
    ENTERPRISE = 'ENTERPRISE',
}

export const TIER_LIMITS: Record<SubscriptionTier, { maxUsers: number; maxCountries: number }> = {
    [SubscriptionTier.FREE]: { maxUsers: 1, maxCountries: 1 },
    [SubscriptionTier.STARTER]: { maxUsers: 5, maxCountries: 1 },
    [SubscriptionTier.GROWTH]: { maxUsers: 20, maxCountries: 2 },
    [SubscriptionTier.SCALE]: { maxUsers: 999, maxCountries: 999 },
    [SubscriptionTier.ENTERPRISE]: { maxUsers: 999, maxCountries: 999 },
};

@Entity('companies')
export class Company {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    slug: string;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({
        name: 'subscription_tier',
        type: 'enum',
        enum: SubscriptionTier,
        default: SubscriptionTier.FREE,
    })
    subscriptionTier: SubscriptionTier;

    @Column({ name: 'max_users', type: 'int', default: 1 })
    maxUsers: number;

    @Column({ name: 'max_countries', type: 'int', default: 1 })
    maxCountries: number;

    @Column({ name: 'subscription_expires_at', type: 'timestamptz', nullable: true })
    subscriptionExpiresAt: Date;

    @Column({ name: 'active_regions', type: 'jsonb' })
    activeRegions: string[];

    @Column({ name: 'default_region_code', type: 'varchar', length: 50 })
    defaultRegionCode: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
