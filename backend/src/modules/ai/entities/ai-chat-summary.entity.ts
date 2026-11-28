import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// One rolling summary of earlier sessions per chat; never shown to the customer.
@Entity('ai_chat_summaries')
@Index(
  'UQ_ai_chat_summaries_company_user_channel_chat',
  ['companyId', 'userId', 'channel', 'chatId'],
  { unique: true },
)
export class AiChatSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'channel', type: 'varchar', length: 32 })
  channel: string;

  // Opaque conversation key of the channel.
  @Column({ name: 'chat_id', type: 'varchar', length: 255 })
  chatId: string;

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary: string | null;

  // Send time of the newest message the summary covers; equal to previousInboundAt once the session is handled.
  @Column({ name: 'summarized_through', type: 'timestamptz', nullable: true })
  summarizedThrough: Date | null;

  // Send time of the customer message that opened the current session.
  @Column({ name: 'session_started_at', type: 'timestamptz' })
  sessionStartedAt: Date;

  // Send time of the customer message before the session start.
  @Column({ name: 'previous_inbound_at', type: 'timestamptz' })
  previousInboundAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
