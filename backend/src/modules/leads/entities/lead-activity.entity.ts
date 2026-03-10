import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Lead } from './lead.entity';
import { Company } from '../../companies/entities/company.entity';

export enum ActivityType {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  VIEWING = 'VIEWING',
  NOTE = 'NOTE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  ASSIGNMENT = 'ASSIGNMENT',
}

@Entity('lead_activities')
export class LeadActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({
    type: 'enum',
    enum: ActivityType,
    default: ActivityType.NOTE,
  })
  type: ActivityType;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
