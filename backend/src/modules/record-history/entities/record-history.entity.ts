import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

export enum RecordHistoryAction {
  DELETE = 'DELETE',
  ARCHIVE = 'ARCHIVE',
  UNARCHIVE = 'UNARCHIVE',
  CANCEL = 'CANCEL',
  REPLACE = 'REPLACE',
  BOUNCE = 'BOUNCE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  TERMINATE = 'TERMINATE',
  DEACTIVATE = 'DEACTIVATE',
  REACTIVATE = 'REACTIVATE',
}

@Entity('record_history')
@Index('IDX_record_history_company_created', ['companyId', 'createdAt'])
@Index('IDX_record_history_entity', ['entityType', 'entityId'])
export class RecordHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // NULL only for global entity types.
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @Column({ type: 'varchar', length: 50 })
  action: RecordHistoryAction;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType: string;

  // No FK: survives hard delete.
  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'entity_title', type: 'varchar', length: 255 })
  entityTitle: string;

  @Column({
    name: 'context_title',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  contextTitle: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Index('IDX_record_history_actor')
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Column({ name: 'actor_name', type: 'varchar', length: 255 })
  actorName: string;

  @Index('IDX_record_history_region_code')
  @Column({ name: 'region_code', type: 'varchar', length: 50, nullable: true })
  regionCode: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
