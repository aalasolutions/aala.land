import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('whatsapp_chats')
@Index('UQ_wa_chats_company_user_chat', ['companyId', 'userId', 'chatId'], {
  unique: true,
})
@Index('IDX_wa_chats_recent', ['companyId', 'userId', 'lastTs'])
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 255 })
  chatId: string;

  @Column({ name: 'chat_name', type: 'varchar', length: 255, default: '' })
  chatName: string;

  @Column({ name: 'is_group', type: 'boolean', default: false })
  isGroup: boolean;

  @Column({ name: 'last_body', type: 'text', default: '' })
  lastBody: string;

  // WhatsApp epoch SECONDS. Read back as a string by pg.
  @Column({ name: 'last_ts', type: 'bigint', default: 0 })
  lastTs: string;

  @Column({ name: 'last_from_me', type: 'boolean', default: false })
  lastFromMe: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
