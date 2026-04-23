import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReminderRule } from './entities/reminder-rule.entity';
import { CreateReminderRuleDto } from './dto/create-reminder-rule.dto';
import { UpdateReminderRuleDto } from './dto/update-reminder-rule.dto';
import { paginationOptions } from '../../shared/utils/pagination.util';

@Injectable()
export class ReminderRulesService {
  constructor(
    @InjectRepository(ReminderRule)
    private readonly reminderRuleRepository: Repository<ReminderRule>,
  ) {}

  async create(companyId: string, dto: CreateReminderRuleDto): Promise<ReminderRule> {
    const rule = this.reminderRuleRepository.create({ ...dto, companyId });
    return this.reminderRuleRepository.save(rule);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: ReminderRule[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.reminderRuleRepository.findAndCount({
      where: { companyId },
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<ReminderRule> {
    const rule = await this.reminderRuleRepository.findOne({
      where: { id, companyId },
    });
    if (!rule) {
      throw new NotFoundException(`Reminder rule with ID ${id} not found`);
    }
    return rule;
  }

  async update(id: string, companyId: string, dto: UpdateReminderRuleDto): Promise<ReminderRule> {
    const rule = await this.findOne(id, companyId);
    Object.assign(rule, dto);
    return this.reminderRuleRepository.save(rule);
  }

  async remove(id: string, companyId: string): Promise<ReminderRule> {
    const rule = await this.findOne(id, companyId);
    rule.isActive = false;
    return this.reminderRuleRepository.save(rule);
  }

  async findActiveByType(companyId: string, type: string): Promise<ReminderRule[]> {
    return this.reminderRuleRepository.find({
      where: { companyId, type: type as any, isActive: true },
      order: { triggerDaysBefore: 'DESC' },
    });
  }
}
