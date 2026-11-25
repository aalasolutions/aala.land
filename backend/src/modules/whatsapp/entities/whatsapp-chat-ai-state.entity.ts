import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export const ESCALATION_REASONS = [
  'request',
  'safety',
  'payment',
  'complaint',
  'opt_out',
  'other',
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

@Entity('whatsapp_chat_ai_states')
@Index(
  'UQ_wa_chat_ai_states_company_user_chat',
  ['companyId', 'userId', 'chatId'],
  { unique: true },
)
export class WhatsappChatAiState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 255 })
  chatId: string;

  @Column({ name: 'escalated_at', type: 'timestamptz', nullable: true })
  escalatedAt: Date | null;

  @Column({
    name: 'escalation_reason',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  escalationReason: EscalationReason | null;

  @Column({
    name: 'escalation_notified_at',
    type: 'timestamptz',
    nullable: true,
  })
  escalationNotifiedAt: Date | null;

  @Column({
    name: 'escalation_holding_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  escalationHoldingSentAt: Date | null;

  @Column({ name: 'opted_out_at', type: 'timestamptz', nullable: true })
  optedOutAt: Date | null;

  @Column({
    name: 'opt_out_language',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  optOutLanguage: string | null;

  @Column({
    name: 'opt_out_confirmed_at',
    type: 'timestamptz',
    nullable: true,
  })
  optOutConfirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
