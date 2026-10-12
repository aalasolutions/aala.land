import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('billing_events')
@Unique('UQ_billing_events_provider_event_id', ['providerEventId'])
export class BillingEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Provider-side event id. The idempotency key. */
  @Column({ name: 'provider_event_id', type: 'varchar', length: 255 })
  providerEventId: string;

  /** Raw provider event type string, e.g. customer.subscription.updated. */
  @Column({ type: 'varchar', length: 255 })
  type: string;

  /** Full raw provider event body. Stored for inspection; never logged. */
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  /** Set by the delivery that claims the event; a duplicate waits until it is stale. */
  @Column({
    name: 'processing_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  processingStartedAt: Date | null;

  /** Set when all handlers completed. NULL means received but not (fully) processed. */
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
