import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WhatsappConnectionStatus {
  PENDING = 'pending',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FLAGGED = 'flagged',
}

// One connected WhatsApp number per agent, enforced by the unique index on userId.
@Entity('whatsapp_connections')
@Index('UQ_wa_connections_user', ['userId'], { unique: true })
// Unique only among CONNECTED/FLAGGED rows; a DISCONNECTED row won't block reconnecting it.
@Index('UQ_wa_connections_phone_number_id', ['phoneNumberId'], {
  unique: true,
  where: "status IN ('connected', 'flagged')",
})
@Index('IDX_wa_connections_company_status', ['companyId', 'status'])
export class WhatsappConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'waba_id', type: 'varchar', length: 64 })
  wabaId: string;

  // Meta sends this on every webhook; it is how a delivery is routed to a company.
  @Column({ name: 'phone_number_id', type: 'varchar', length: 64 })
  phoneNumberId: string;

  @Column({ name: 'display_phone_number', type: 'varchar', length: 32 })
  displayPhoneNumber: string;

  @Column({
    type: 'enum',
    enum: WhatsappConnectionStatus,
    default: WhatsappConnectionStatus.PENDING,
  })
  status: WhatsappConnectionStatus;

  // AES-256-GCM ciphertext; never logged. Set only via encrypt(), read only via resolveAccessToken().
  @Column({ name: 'access_token_ciphertext', type: 'text', nullable: true })
  accessTokenCiphertext: string | null;

  @Column({ name: 'token_updated_at', type: 'timestamptz', nullable: true })
  tokenUpdatedAt: Date | null;

  @Column({ name: 'connected_at', type: 'timestamptz', nullable: true })
  connectedAt: Date | null;

  @Column({ name: 'disconnected_at', type: 'timestamptz', nullable: true })
  disconnectedAt: Date | null;

  // Meta's reason string, e.g. PARTNER_REMOVED / PRIMARY_INACTIVITY.
  @Column({
    name: 'disconnect_reason',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  disconnectReason: string | null;

  // Meta entry.time of the last applied account_update; older events are refused.
  @Column({ name: 'lifecycle_event_at', type: 'timestamptz', nullable: true })
  lifecycleEventAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
