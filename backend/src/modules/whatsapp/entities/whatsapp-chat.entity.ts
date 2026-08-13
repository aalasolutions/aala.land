import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contact } from '../../contacts/entities/contact.entity';

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

  // Resolved when the chat's number matches a contact in this company. An
  // inbound message from a known number points here; an unknown number stays
  // null until an operator saves it.
  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact | null;

  // True once contact_id resolution has been attempted for this chat, whether or
  // not it matched. Stops the resolution UPDATE re-running on every inbound
  // message for a number that has no contact yet.
  @Column({
    name: 'contact_resolution_attempted',
    type: 'boolean',
    default: false,
  })
  contactResolutionAttempted: boolean;

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
