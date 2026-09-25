import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { WaMediaStatus } from '../wa-types';

export enum WhatsappMessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  PLAYED = 'played',
}

// No retention pruning by design, unlike whatsapp_ai_conversations (pruned at 13 months).
@Entity('whatsapp_messages')
@Index(
  'UQ_wa_messages_company_user_wa_id',
  ['companyId', 'userId', 'waMessageId'],
  { unique: true },
)
@Index('IDX_wa_messages_chat', ['companyId', 'userId', 'chatId', 'timestamp'])
@Index('IDX_wa_messages_agent', ['companyId', 'userId', 'timestamp'])
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Never rewritten by a reassignment move, unlike userId above.
  @Column({ name: 'origin_user_id', type: 'uuid', nullable: true })
  originUserId: string | null;

  @Column({ name: 'wa_message_id', type: 'varchar', length: 255 })
  waMessageId: string;

  // The customer's number in E.164, not a Baileys JID.
  @Column({ name: 'chat_id', type: 'varchar', length: 255 })
  chatId: string;

  @Column({ name: 'sender_id', type: 'varchar', length: 255, default: '' })
  senderId: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 255, default: '' })
  senderName: string;

  @Column({ name: 'chat_name', type: 'varchar', length: 255, default: '' })
  chatName: string;

  @Column({ name: 'is_group', type: 'boolean', default: false })
  isGroup: boolean;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ name: 'has_media', type: 'boolean', default: false })
  hasMedia: boolean;

  @Column({ name: 'media_type', type: 'varchar', length: 32, default: '' })
  mediaType: string;

  // Meta media id, valid for 7 days; the download job reads it.
  @Column({ name: 'media_meta_id', type: 'varchar', nullable: true })
  mediaMetaId: string | null;

  @Column({ name: 'media_mime', type: 'varchar', nullable: true })
  mediaMime: string | null;

  @Column({ name: 'media_file_name', type: 'varchar', nullable: true })
  mediaFileName: string | null;

  @Column({
    name: 'media_size_bytes',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  mediaSizeBytes: number | null;

  @Column({ name: 'media_sha256', type: 'varchar', nullable: true })
  mediaSha256: string | null;

  // Object key in the WhatsApp bucket; kept on DELETED rows as the audit record of the purged object.
  @Column({ name: 'media_key', type: 'varchar', nullable: true })
  mediaKey: string | null;

  @Column({ name: 'media_status', type: 'varchar', length: 16, nullable: true })
  mediaStatus: WaMediaStatus | null;

  @Column({ name: 'media_stored_at', type: 'timestamptz', nullable: true })
  mediaStoredAt: Date | null;

  @Column({ name: 'media_deleted_at', type: 'timestamptz', nullable: true })
  mediaDeletedAt: Date | null;

  // A user id, or a WA_MEDIA_DELETED_BY value.
  @Column({ name: 'media_deleted_by', type: 'varchar', nullable: true })
  mediaDeletedBy: string | null;

  @Column({ name: 'mentioned_ids', type: 'jsonb', default: () => `'[]'` })
  mentionedIds: string[];

  @Column({
    name: 'quoted_participant',
    type: 'varchar',
    length: 255,
    default: '',
  })
  quotedParticipant: string;

  @Column({ name: 'from_me', type: 'boolean', default: false })
  fromMe: boolean;

  @Column({ name: 'ai_generated', type: 'boolean', default: false })
  aiGenerated: boolean;

  @Column({
    name: 'phone_number_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  phoneNumberId: string | null;

  // Outbound only. Inbound messages have no delivery status.
  @Column({
    name: 'status',
    type: 'enum',
    enum: WhatsappMessageStatus,
    nullable: true,
  })
  status: WhatsappMessageStatus | null;

  @Column({ name: 'status_at', type: 'timestamptz', nullable: true })
  statusAt: Date | null;

  @Column({ name: 'error_code', type: 'varchar', length: 32, nullable: true })
  errorCode: string | null;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  // WhatsApp epoch SECONDS, not milliseconds. Read back as a string by pg.
  @Column({ type: 'bigint' })
  timestamp: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
