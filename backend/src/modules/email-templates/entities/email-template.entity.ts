import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum EmailTemplateCategory {
  FOLLOW_UP = 'FOLLOW_UP',
  WELCOME = 'WELCOME',
  LEASE_RENEWAL = 'LEASE_RENEWAL',
  PAYMENT_REMINDER = 'PAYMENT_REMINDER',
  MAINTENANCE_UPDATE = 'MAINTENANCE_UPDATE',
  MARKETING = 'MARKETING',
  CUSTOM = 'CUSTOM',
}

@Entity('email_templates')
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: EmailTemplateCategory,
    default: EmailTemplateCategory.CUSTOM,
  })
  category: EmailTemplateCategory;

  @Column({ type: 'jsonb', default: '[]' })
  variables: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
