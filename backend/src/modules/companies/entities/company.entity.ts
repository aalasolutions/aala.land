import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum SubscriptionTier {
    FREE = 'FREE',
    STARTER = 'STARTER',
    PRO = 'PRO',
}

export const TIER_LIMITS: Record<SubscriptionTier, { maxUsers: number; maxCountries: number; maxProperties: number }> = {
    [SubscriptionTier.FREE]:    { maxUsers: 1,   maxCountries: 1,   maxProperties: 25  },
    [SubscriptionTier.STARTER]: { maxUsers: 5,   maxCountries: 1,   maxProperties: 100 },
    [SubscriptionTier.PRO]:     { maxUsers: 999, maxCountries: 999, maxProperties: 999 },
};

export const FREE_STORAGE_BYTES  = 2 * 1024 * 1024 * 1024;  // 2 GB flat (FREE tier)
export const BYTES_PER_SEAT      = 5 * 1024 * 1024 * 1024;  // 5 GB per purchased seat (paid tiers)

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
        type: 'varchar',
        length: 50,
        default: SubscriptionTier.FREE,
    })
    subscriptionTier: SubscriptionTier;

    @Column({ name: 'max_users', type: 'int', default: 1 })
    maxUsers: number;

    @Column({ name: 'max_countries', type: 'int', default: 1 })
    maxCountries: number;

    @Column({ name: 'max_properties', type: 'int', default: 25 })
    maxProperties: number;

    @Column({ name: 'subscription_expires_at', type: 'timestamptz', nullable: true })
    subscriptionExpiresAt: Date | null;

    @Column({ name: 'active_regions', type: 'jsonb', nullable: true })
    activeRegions: string[] | null;

    @Column({ name: 'default_region_code', type: 'varchar', length: 50, nullable: true })
    defaultRegionCode: string | null;

    @Column({
      name: 'storage_used_bytes',
      type: 'bigint',
      default: 0,
      transformer: {
        to: (v: number) => v,
        from: (v: string | null) => Number(v ?? '0'),
      },
    })
    storageUsedBytes: number;

    @Column({ name: 'purchased_seats', type: 'integer', default: 1 })
    purchasedSeats: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
