import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { EmailTemplate, EmailTemplateCategory } from './entities/email-template.entity';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { paginationOptions } from '../../shared/utils/pagination.util';

@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly templateRepository: Repository<EmailTemplate>,
  ) { }

  async create(companyId: string, dto: CreateEmailTemplateDto, createdBy?: string): Promise<EmailTemplate> {
    const template = this.templateRepository.create({ ...dto, companyId, createdBy });
    return this.templateRepository.save(template);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    category?: EmailTemplateCategory,
  ): Promise<{ data: EmailTemplate[]; total: number; page: number; limit: number }> {
    const where: FindOptionsWhere<EmailTemplate> = { companyId };
    if (category) {
      where.category = category;
    }

    const [data, total] = await this.templateRepository.findAndCount({
      where,
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<EmailTemplate> {
    const template = await this.templateRepository.findOne({ where: { id, companyId } });
    if (!template) {
      throw new NotFoundException('Email template not found');
    }
    return template;
  }

  async update(id: string, companyId: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    const template = await this.findOne(id, companyId);
    Object.assign(template, dto);
    return this.templateRepository.save(template);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const template = await this.findOne(id, companyId);
    await this.templateRepository.remove(template);
  }

  async render(
    id: string,
    companyId: string,
    variables: Record<string, string>,
  ): Promise<{ subject: string; body: string }> {
    const template = await this.findOne(id, companyId);

    let renderedSubject = template.subject;
    let renderedBody = template.body;

    for (const [key, value] of Object.entries(variables)) {
      renderedSubject = renderedSubject.split(`{{${key}}}`).join(value);
      renderedSubject = renderedSubject.split(`{${key}}`).join(value);
      renderedBody = renderedBody.split(`{{${key}}}`).join(value);
      renderedBody = renderedBody.split(`{${key}}`).join(value);
    }

    return { subject: renderedSubject, body: renderedBody };
  }
}
