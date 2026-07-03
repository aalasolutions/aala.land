import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';

@Entity('stripe_events')
@Unique('UQ_stripe_events_provider_event_id', ['providerEventId'])
export class StripeEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Provider-side event id (Stripe evt_...). The idempotency key. */
    @Column({ name: 'provider_event_id', type: 'varchar', length: 255 })
    providerEventId: string;

    /** Raw provider event type string, e.g. customer.subscription.updated. */
    @Column({ type: 'varchar', length: 255 })
    type: string;

    /** Full raw provider event body. Stored for inspection; never logged. */
    @Column({ type: 'jsonb' })
    payload: Record<string, unknown>;

    @CreateDateColumn({ name: 'received_at' })
    receivedAt: Date;

    /** Set when all handlers completed. NULL means received but not (fully) processed. */
    @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
    processedAt: Date | null;
}
