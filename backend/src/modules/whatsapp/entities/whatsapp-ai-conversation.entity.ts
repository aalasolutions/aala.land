import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One row per credited 24-hour conversation window. Append-only: it is both the
 * live window state and the per-conversation audit trail, so one row is exactly
 * one consumed credit and per-agent spend is a GROUP BY over user_id.
 */
@Entity('whatsapp_ai_conversations')
@Index('IDX_wa_ai_conversations_window', [
  'companyId',
  'userId',
  'chatId',
  'expiresAt',
])
@Index('IDX_wa_ai_conversations_period', ['companyId', 'periodStart'])
export class WhatsappAiConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 255 })
  chatId: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'messages_count', type: 'int', default: 1 })
  messagesCount: number;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
