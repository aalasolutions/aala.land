import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Lead, LeadStatus } from './entities/lead.entity';
import { LeadActivity, ActivityType } from './entities/lead-activity.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Locality } from '../locations/entities/locality.entity';
import { Unit } from '../properties/entities/unit.entity';
import { resolveRegionCode } from '../../shared/utils/resolve-region-code.util';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { Role } from '../../shared/enums/roles.enum';

export type LeadResponse = Omit<Lead, 'assignedAgent'> & {
  assignedAgentName: string | null;
};

export type LeadActivityResponse = Omit<LeadActivity, 'performer'> & {
  performedByName: string | null;
};

type PaginatedLeadResponse = {
  data: LeadResponse[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private readonly activityRepository: Repository<LeadActivity>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Locality)
    private readonly localityRepository: Repository<Locality>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
  ) { }

  async create(companyId: string, dto: CreateLeadDto): Promise<Lead> {
    const { propertyId, unitId, regionCode: dtoRegionCode, ...rest } = dto;

    if (propertyId) await this.validateLocalityExists(propertyId);
    if (unitId) await this.validateUnitOwnership(unitId, companyId);

    const regionCode = await resolveRegionCode(this.companyRepository, companyId, dtoRegionCode);
    const lead = this.leadRepository.create({ ...rest, propertyId, unitId, companyId, regionCode });
    return this.leadRepository.save(lead);
  }

  async findAll(companyId: string, page = 1, limit = 20, regionCode?: string): Promise<PaginatedLeadResponse> {
    const where: FindOptionsWhere<Lead> = { companyId };
    if (regionCode) where.regionCode = regionCode;

    const [data, total] = await this.leadRepository.findAndCount({
      where,
      relations: ['property', 'unit', 'assignedAgent'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return {
      data: data.map((lead) => this.serializeLead(lead)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, companyId: string): Promise<LeadResponse> {
    const lead = await this.findLeadEntityOrThrow(id, companyId);
    return this.serializeLead(lead);
  }

  async update(id: string, companyId: string, dto: UpdateLeadDto, userId?: string, userRole?: string): Promise<LeadResponse> {
    const lead = await this.findLeadEntityOrThrow(id, companyId);

    if (dto.propertyId && dto.propertyId !== lead.propertyId) {
      await this.validateLocalityExists(dto.propertyId);
    }
    if (dto.unitId && dto.unitId !== lead.unitId) {
      await this.validateUnitOwnership(dto.unitId, companyId);
    }

    const hasStatusUpdate = 'status' in dto;
    const hasAssignmentUpdate = 'assignedTo' in dto;
    const previousAssignedTo = lead.assignedTo;

    if (hasStatusUpdate && dto.status === null) {
      throw new BadRequestException('status cannot be null');
    }

    let assignedAgent: Pick<User, 'id' | 'name'> | null = null;
    if (hasAssignmentUpdate) {
      if (!this.canManageAssignments(userRole)) {
        throw new ForbiddenException('Only company admins can change lead assignment');
      }

      if (dto.assignedTo) {
        assignedAgent = await this.findAssignableAgentOrThrow(dto.assignedTo, companyId);
      }
    }

    const previousStatus = lead.status;
    const statusChanged = hasStatusUpdate && dto.status !== previousStatus;
    const assignmentChanged = hasAssignmentUpdate && dto.assignedTo !== previousAssignedTo;

    Object.assign(lead, dto);

    if (dto.propertyId === null) lead.property = null;
    if (dto.unitId === null) lead.unit = null;

    if (hasAssignmentUpdate) {
      if (assignmentChanged && previousAssignedTo) {
        lead.previousAgent = previousAssignedTo;
      }
      if (dto.assignedTo === null) {
        lead.assignedAgent = null;
      } else if (dto.assignedTo && assignedAgent) {
        lead.assignedAgent = assignedAgent as User;
      }
    }

    if (statusChanged) {
      lead.stageEnteredAt = new Date();
    }

    await this.leadRepository.save(lead);

    if (statusChanged) {
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

    if (assignmentChanged) {
      await this.activityRepository.save(
        this.activityRepository.create({
          leadId: id,
          companyId,
          type: ActivityType.ASSIGNMENT,
          notes: assignedAgent ? `Lead assigned to agent ${assignedAgent.name}` : 'Lead unassigned',
          performedBy: userId,
        }),
      );
    }

    return this.findOne(id, companyId);
  }

  async assign(id: string, companyId: string, agentId: string, performedBy?: string, reason?: string): Promise<LeadResponse> {
    const lead = await this.findLeadEntityOrThrow(id, companyId);
    const agent = await this.findAssignableAgentOrThrow(agentId, companyId);

    if (lead.assignedTo) {
      lead.previousAgent = lead.assignedTo;
    }
    if (reason) {
      lead.transferReason = reason;
    }

    lead.assignedTo = agentId;
    lead.assignedAgent = agent as User;
    await this.leadRepository.save(lead);

    const agentLabel = agent.name;
    const activityNotes = reason
      ? `Lead assigned to agent ${agentLabel} (reason: ${reason})`
      : `Lead assigned to agent ${agentLabel}`;

    await this.activityRepository.save(
      this.activityRepository.create({
        leadId: id,
        companyId,
        type: ActivityType.ASSIGNMENT,
        notes: activityNotes,
        performedBy,
      }),
    );

    return this.findOne(id, companyId);
  }

  async convert(id: string, companyId: string, performedBy?: string): Promise<Lead> {
    const lead = await this.findLeadEntityOrThrow(id, companyId);
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
    await this.findLeadEntityOrThrow(leadId, companyId);

    const activity = this.activityRepository.create({
      leadId,
      companyId,
      ...dto,
      performedBy,
    });
    return this.activityRepository.save(activity);
  }

  async findActivities(leadId: string, companyId: string): Promise<LeadActivityResponse[]> {
    await this.findLeadEntityOrThrow(leadId, companyId);

    const activities = await this.activityRepository.find({
      where: { leadId, companyId },
      relations: ['performer'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    return activities.map(({ performer, ...activity }) => ({
      ...activity,
      performedByName: performer?.name ?? null,
    }));
  }

  private async findLeadEntityOrThrow(id: string, companyId: string): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id, companyId },
      relations: ['property', 'unit', 'assignedAgent'],
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  private canManageAssignments(userRole?: string): boolean {
    return userRole === Role.COMPANY_ADMIN || userRole === Role.SUPER_ADMIN;
  }

  private async findAssignableAgentOrThrow(agentId: string, companyId: string): Promise<Pick<User, 'id' | 'name'>> {
    const agent = await this.userRepository.findOne({
      where: { id: agentId, companyId },
      select: { id: true, name: true },
    });

    if (!agent) {
      throw new NotFoundException('Assigned agent not found');
    }

    return agent;
  }

  private async validateLocalityExists(propertyId: string): Promise<void> {
    const exists = await this.localityRepository.exist({
      where: { id: propertyId },
    });
    if (!exists) {
      throw new BadRequestException('Invalid property (locality) selected');
    }
  }

  private async validateUnitOwnership(unitId: string, companyId: string): Promise<void> {
    const unit = await this.unitRepository.findOne({
      where: { id: unitId, companyId },
    });
    if (!unit) {
      throw new BadRequestException('Invalid unit selected');
    }
  }

  private serializeLead(lead: Lead): LeadResponse {
    const { assignedAgent, ...leadWithoutAssignedAgent } = lead;
    return {
      ...leadWithoutAssignedAgent,
      assignedAgentName: assignedAgent?.name ?? null,
    };
  }
}
