import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SubscriptionTier {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

// 999 is a finite sentinel, not Infinity: webhook sync writes it into int NOT NULL columns.
export const TIER_LIMITS: Record<
  SubscriptionTier,
  {
    maxUsers: number;
    maxRegions: number;
    maxProperties: number;
  }
> = {
  [SubscriptionTier.FREE]: {
    maxUsers: 1,
    maxRegions: 1,
    maxProperties: 25,
  },
  [SubscriptionTier.PRO]: {
    maxUsers: 999,
    maxRegions: 999,
    maxProperties: 999,
  },
  [SubscriptionTier.ENTERPRISE]: {
    maxUsers: 999,
    maxRegions: 999,
    maxProperties: 999,
  },
};

export const FREE_STORAGE_BYTES = 2 * 1024 * 1024 * 1024;
export const BYTES_PER_SEAT = 5 * 1024 * 1024 * 1024;
export const ENTERPRISE_BYTES_PER_SEAT = 10 * 1024 * 1024 * 1024;

// 1 AI credit = one 24-hour conversation window between one agent and one lead.
export const FREE_AI_CREDITS = 50;
export const AI_CREDITS_PER_SEAT = 200;
export const ENTERPRISE_AI_CREDITS_PER_SEAT = 500;
export const AI_CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

@Entity('companies')
@Index('UQ_companies_billing_customer_id', ['billingCustomerId'], {
  unique: true,
  where: 'billing_customer_id IS NOT NULL',
})
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

  @Column({ name: 'max_regions', type: 'int', default: 1 })
  maxRegions: number;

  @Column({ name: 'max_properties', type: 'int', default: 25 })
  maxProperties: number;

  @Column({
    name: 'subscription_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  subscriptionExpiresAt: Date | null;

  @Column({ name: 'active_regions', type: 'jsonb', nullable: true })
  activeRegions: string[] | null;

  @Column({
    name: 'default_region_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
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

  @Column({
    name: 'billing_provider',
    type: 'varchar',
    length: 32,
    default: 'stripe',
  })
  billingProvider: string;

  @Column({
    name: 'billing_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  billingCustomerId: string | null;

  @Column({
    name: 'billing_subscription_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  billingSubscriptionId: string | null;

  @Column({
    name: 'billing_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  billingStatus: string | null;

  // Webhook-pinned from Stripe, null until subscribed; decoupled from defaultRegionCode by design.
  @Column({
    name: 'billing_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  billingCurrency: string | null;

  @Column({ name: 'billing_meta', type: 'jsonb', nullable: true })
  billingMeta: Record<string, unknown> | null;

  // First-touch immutable: set only at signup, never present in the update DTO.
  @Column({
    name: 'marketer_code',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  marketerCode: string | null;

  // Recency guard: stops an out-of-order/retried webhook from overwriting purchasedSeats/status.
  @Column({
    name: 'billing_last_event_at',
    type: 'timestamptz',
    nullable: true,
  })
  billingLastEventAt: Date | null;

  // Claimed atomically to dedup the quota-exceeded email to at most once per 24h.
  @Column({
    name: 'storage_quota_notified_at',
    type: 'timestamptz',
    nullable: true,
  })
  storageQuotaNotifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
