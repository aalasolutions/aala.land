import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

@Entity('whatsapp_settings')
export class WhatsappSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid', unique: true, nullable: false })
  companyId: string;

  @OneToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'ai_prompt', type: 'text', nullable: true })
  aiPrompt: string | null;

  @Column({ name: 'ai_enabled', type: 'boolean', nullable: true, default: null })
  aiEnabled: boolean | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
