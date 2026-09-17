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
import { User } from '../../users/entities/user.entity';

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
@Index('UQ_notifications_reminder_dedup_daily', { synchronize: false })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_NOTIFICATIONS_COMPANY_ID')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index('IDX_NOTIFICATIONS_USER_ID')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_9a8a82462cab47c73d25f49261f',
  })
  user: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column({ name: 'entity_type', type: 'varchar', length: 100, nullable: true })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string;

  // NULL means company-wide, so it shows in every region.
  @Index('IDX_NOTIFICATIONS_REGION_CODE')
  @Column({ name: 'region_code', type: 'varchar', length: 50, nullable: true })
  regionCode: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Index('IDX_NOTIFICATIONS_CREATED_AT')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
