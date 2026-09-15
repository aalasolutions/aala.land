import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum StoragePurgeStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum StorageBucketKind {
  MEDIA = 'MEDIA',
  DOCUMENTS = 'DOCUMENTS',
}

// No FK on company_id: the outbox row must outlive the company and its files.
@Entity('storage_purge_jobs')
@Index('IDX_storage_purge_jobs_status_created', ['status', 'createdAt'])
export class StoragePurgeJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_storage_purge_jobs_company')
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'bucket_kind', type: 'varchar', length: 20 })
  bucketKind: StorageBucketKind;

  @Column({ name: 's3_key', type: 'varchar', length: 500 })
  s3Key: string;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => Number(v ?? '0'),
    },
  })
  bytes: number;

  @Column({ name: 'source_type', type: 'varchar', length: 50, nullable: true })
  sourceType: string | null;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: StoragePurgeStatus.PENDING,
  })
  status: StoragePurgeStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
