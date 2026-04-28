import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum NotificationType {
  LEAD_ASSIGNED = 'LEAD_ASSIGNED',
  LEAD_UNASSIGNED = 'LEAD_UNASSIGNED',
  LEAD_STATUS_CHANGED = 'LEAD_STATUS_CHANGED',
  LEASE_EXPIRING = 'LEASE_EXPIRING',
  MAINTENANCE_UPDATE = 'MAINTENANCE_UPDATE',
  CHEQUE_DUE = 'CHEQUE_DUE',
  CHEQUE_DEPOSITED = 'CHEQUE_DEPOSITED',
  CHEQUE_BOUNCED = 'CHEQUE_BOUNCED',
  CHEQUE_OVERDUE = 'CHEQUE_OVERDUE',
  CHEQUE_DELAYED = 'CHEQUE_DELAYED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  SYSTEM = 'SYSTEM',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.SYSTEM })
  type: NotificationType;

  @Column({ name: 'entity_type', type: 'varchar', length: 100, nullable: true })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
