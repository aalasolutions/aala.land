import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum SubscriptionTier {
    FREE = 'FREE',
    PRO = 'PRO',
    ENTERPRISE = 'ENTERPRISE',
}

// Caps live on Free only. 999 is the frozen finite "uncapped" sentinel (contract
// section 11): the webhook cap-column sync writes these values into int NOT NULL
// columns, so Infinity is permitted ONLY for aiWeeklyMessages, which is never
// synced to a column. aiWeeklyMessages is the interim AI limiter until the
// credit ledger lands (parked behind the WhatsApp PR).
export const TIER_LIMITS: Record<SubscriptionTier, { maxUsers: number; maxCountries: number; maxProperties: number; aiWeeklyMessages: number }> = {
    [SubscriptionTier.FREE]:       { maxUsers: 1,   maxCountries: 1,   maxProperties: 25,  aiWeeklyMessages: 10 },
    [SubscriptionTier.PRO]:        { maxUsers: 999, maxCountries: 999, maxProperties: 999, aiWeeklyMessages: Infinity },
    [SubscriptionTier.ENTERPRISE]: { maxUsers: 999, maxCountries: 999, maxProperties: 999, aiWeeklyMessages: Infinity },
};

export const FREE_STORAGE_BYTES        = 2 * 1024 * 1024 * 1024;   // 2 GB flat (FREE tier)
export const BYTES_PER_SEAT            = 5 * 1024 * 1024 * 1024;   // 5 GB per purchased seat (PRO)
export const ENTERPRISE_BYTES_PER_SEAT = 10 * 1024 * 1024 * 1024;  // 10 GB per purchased seat (ENTERPRISE)

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

    @Column({ name: 'billing_provider', type: 'varchar', length: 32, default: 'stripe' })
    billingProvider: string;

    @Column({ name: 'billing_customer_id', type: 'varchar', length: 255, nullable: true })
    billingCustomerId: string | null;

    @Column({ name: 'billing_subscription_id', type: 'varchar', length: 255, nullable: true })
    billingSubscriptionId: string | null;

    @Column({ name: 'billing_status', type: 'varchar', length: 50, nullable: true })
    billingStatus: string | null;

    @Column({ name: 'billing_meta', type: 'jsonb', nullable: true })
    billingMeta: Record<string, unknown> | null;

    /**
     * Stripe event.created timestamp of the last seat/subscription sync applied
     * to this company. The webhook uses it as a recency guard so an out-of-order
     * or retried event cannot overwrite purchasedSeats/status with a stale value
     * (race audit 2026-07-07, P1c). Written only by the webhook, alongside the
     * other billing_* columns it owns.
     */
    @Column({ name: 'billing_last_event_at', type: 'timestamptz', nullable: true })
    billingLastEventAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
