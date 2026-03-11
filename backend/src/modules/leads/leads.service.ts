import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadStatus } from './entities/lead.entity';
import { LeadActivity, ActivityType } from './entities/lead-activity.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private readonly activityRepository: Repository<LeadActivity>,
  ) { }

  async create(companyId: string, dto: CreateLeadDto): Promise<Lead> {
    const lead = this.leadRepository.create({ ...dto, companyId });
    return this.leadRepository.save(lead);
  }

  async findAll(companyId: string, page = 1, limit = 20): Promise<{ data: Lead[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.leadRepository.findAndCount({
      where: { companyId },
      relations: ['property', 'unit'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id, companyId },
      relations: ['property', 'unit'],
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async update(id: string, companyId: string, dto: UpdateLeadDto, userId?: string): Promise<Lead> {
    const lead = await this.findOne(id, companyId);
    const previousStatus = lead.status;

    Object.assign(lead, dto);

    if (dto.status && dto.status !== previousStatus) {
      lead.stageEnteredAt = new Date();
    }

    const updated = await this.leadRepository.save(lead);

    if (dto.status && dto.status !== previousStatus) {
      await this.activityRepository.save(
        this.activityRepository.create({
          leadId: id,
          companyId,
          type: ActivityType.STATUS_CHANGE,
          notes: `Status changed from ${previousStatus} to ${dto.status}`,
          performedBy: userId,
        }),
      );
    }

    return updated;
  }

  async assign(id: string, companyId: string, agentId: string, performedBy?: string, reason?: string): Promise<Lead> {
    const lead = await this.findOne(id, companyId);

    if (lead.assignedTo) {
      lead.previousAgent = lead.assignedTo;
    }
    if (reason) {
      lead.transferReason = reason;
    }

    lead.assignedTo = agentId;
    const updated = await this.leadRepository.save(lead);

    const activityNotes = reason
      ? `Lead assigned to agent ${agentId} (reason: ${reason})`
      : `Lead assigned to agent ${agentId}`;

    await this.activityRepository.save(
      this.activityRepository.create({
        leadId: id,
        companyId,
        type: ActivityType.ASSIGNMENT,
        notes: activityNotes,
        performedBy,
      }),
    );

    return updated;
  }

  async convert(id: string, companyId: string, performedBy?: string): Promise<Lead> {
    const lead = await this.findOne(id, companyId);
    const previousStatus = lead.status;
    lead.status = LeadStatus.WON;
    const updated = await this.leadRepository.save(lead);

    await this.activityRepository.save(
      this.activityRepository.create({
        leadId: id,
        companyId,
        type: ActivityType.STATUS_CHANGE,
        notes: `Lead converted: status changed from ${previousStatus} to ${LeadStatus.WON}`,
        performedBy,
      }),
    );

    return updated;
  }

  async addActivity(leadId: string, companyId: string, dto: CreateLeadActivityDto, performedBy?: string): Promise<LeadActivity> {
    await this.findOne(leadId, companyId);

    const activity = this.activityRepository.create({
      leadId,
      companyId,
      ...dto,
      performedBy,
    });
    return this.activityRepository.save(activity);
  }

  async findActivities(leadId: string, companyId: string): Promise<LeadActivity[]> {
    await this.findOne(leadId, companyId);

    return this.activityRepository.find({
      where: { leadId, companyId },
      order: { createdAt: 'DESC' },
    });
  }
}
