import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MessageStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

@Entity('whatsapp_messages')
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'phone_number', length: 30 })
  phoneNumber: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: MessageDirection,
    default: MessageDirection.OUTBOUND,
  })
  direction: MessageDirection;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.QUEUED,
  })
  status: MessageStatus;

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ name: 'media_url', type: 'varchar', nullable: true })
  mediaUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
