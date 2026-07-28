import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Retention: none by design (owner ruling 2026-07-27). Unlike whatsapp_ai_conversations,
// which AiConversationRetentionCron prunes at 13 months.
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

  // Bare filenames on local disk until Unit 3 moves media to S3.
  @Column({ name: 'media_urls', type: 'jsonb', default: () => `'[]'` })
  mediaUrls: string[];

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

  // WhatsApp epoch SECONDS, not milliseconds. Read back as a string by pg.
  @Column({ type: 'bigint' })
  timestamp: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
