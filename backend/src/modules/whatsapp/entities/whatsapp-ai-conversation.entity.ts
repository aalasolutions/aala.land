import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// One row is one consumed credit, never reversed: buys the 24h window, not the reply
@Entity('whatsapp_ai_conversations')
@Index('IDX_wa_ai_conversations_window', [
  'companyId',
  'userId',
  'chatId',
  'expiresAt',
])
@Index('IDX_wa_ai_conversations_period', ['companyId', 'periodStart'])
@Index('IDX_wa_ai_conversations_open', ['companyId', 'expiresAt'])
export class WhatsappAiConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 255 })
  chatId: string;

  // Same identity as whatsapp_messages/chats, so AI and Meta reply windows can reconcile per number.
  @Column({
    name: 'phone_number_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  phoneNumberId: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'messages_count', type: 'int', default: 0 })
  messagesCount: number;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
