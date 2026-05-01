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
import { resolveRegionCode } from '../../shared/utils/resolve-region-code.util';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { Role } from '../../shared/enums/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';

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
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly notificationsGateway: NotificationsGateway,
  ) { }

  async create(companyId: string, dto: CreateLeadDto, userId?: string): Promise<Lead> {
    const regionCode = await resolveRegionCode(this.companyRepository, companyId, dto.regionCode);
    const lead = this.leadRepository.create({ ...dto, companyId, regionCode });
    const saved = await this.leadRepository.save(lead);

    const clientName = `${saved.firstName} ${saved.lastName || ''}`.trim();

    // Broadcast update to all users in the company
    this.notificationsGateway.broadcastToCompany(companyId, 'leadUpdated', {
      id: saved.id,
      status: saved.status,
      assignedTo: saved.assignedTo,
      updatedBy: userId,
    });

    if (!saved.assignedTo) {
      const admins = await this.usersService.findAdmins(companyId);
      for (const admin of admins) {
        if (admin.id === userId) {
          continue;
        }

        await this.notificationsService.create(companyId, {
          userId: admin.id,
          title: 'New Unassigned Lead',
          message: `A new lead for ${clientName} has been created and needs assignment.`,
          type: NotificationType.LEAD_UNASSIGNED,
          entityType: 'lead',
          entityId: saved.id,
        });
      }
    } else {
      if (saved.assignedTo !== userId) {
        await this.notificationsService.create(companyId, {
          userId: saved.assignedTo,
          title: 'New Lead Assigned',
          message: `You have been assigned a new lead: ${clientName}`,
          type: NotificationType.LEAD_ASSIGNED,
          entityType: 'lead',
          entityId: saved.id,
        });
      }
    }

    return saved;
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
    const hasStatusUpdate = Object.prototype.hasOwnProperty.call(dto, 'status');
    const hasAssignmentUpdate = Object.prototype.hasOwnProperty.call(dto, 'assignedTo');
    const previousAssignedTo = lead.assignedTo;

    if (hasStatusUpdate && dto.status === null) {
      throw new BadRequestException('status cannot be null');
    }

    let assignedAgent: Pick<User, 'id' | 'name'> | null = null;
    if (hasAssignmentUpdate) {
      if (!this.canManageAssignments(userRole)) {
        throw new ForbiddenException('Only company admins can change lead assignment');
      }

      if (dto.assignedTo !== null && dto.assignedTo !== undefined) {
        assignedAgent = await this.findAssignableAgentOrThrow(dto.assignedTo, companyId);
      }
    }

    const previousStatus = lead.status;
    const statusChanged = hasStatusUpdate && dto.status !== previousStatus;
    const assignmentChanged = hasAssignmentUpdate && dto.assignedTo !== previousAssignedTo;

    Object.assign(lead, dto);

    if (Object.prototype.hasOwnProperty.call(dto, 'propertyId') && dto.propertyId === null) {
      lead.property = null;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'unitId') && dto.unitId === null) {
      lead.unit = null;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'assignedTo')) {
      if (assignmentChanged && previousAssignedTo) {
        lead.previousAgent = previousAssignedTo;
      }
      if (dto.assignedTo === null) {
        lead.assignedAgent = null;
      } else if (dto.assignedTo !== undefined && assignedAgent) {
        lead.assignedAgent = assignedAgent as User;
      }
    }

    if (statusChanged) {
      lead.stageEnteredAt = new Date();
    }

    await this.leadRepository.save(lead);

    const clientName = `${lead.firstName} ${lead.lastName || ''}`.trim();

    // Broadcast update to all users in the company
    this.notificationsGateway.broadcastToCompany(companyId, 'leadUpdated', {
      id,
      status: lead.status,
      assignedTo: lead.assignedTo,
      updatedBy: userId,
    });

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

      // Notify assigned agent about status change (only if it's not the performer)
      if (lead.assignedTo && lead.assignedTo !== userId) {
        await this.notificationsService.create(companyId, {
          userId: lead.assignedTo,
          title: 'Lead Status Updated',
          message: `Lead ${clientName} status changed to ${lead.status}`,
          type: NotificationType.LEAD_STATUS_CHANGED,
          entityType: 'lead',
          entityId: lead.id,
        });
      }
    }

    if (assignmentChanged) {
      const assignmentNotes = assignedAgent
        ? `Lead assigned to agent ${assignedAgent.name}`
        : 'Lead unassigned';

      await this.activityRepository.save(
        this.activityRepository.create({
          leadId: id,
          companyId,
          type: ActivityType.ASSIGNMENT,
          notes: assignmentNotes,
          performedBy: userId,
        }),
      );

      if (dto.assignedTo && dto.assignedTo !== userId) {
        await this.notificationsService.create(companyId, {
          userId: dto.assignedTo,
          title: 'New Lead Assigned',
          message: `You have been assigned a lead: ${clientName}`,
          type: NotificationType.LEAD_ASSIGNED,
          entityType: 'lead',
          entityId: lead.id,
        });
      } else if (assignmentChanged && !dto.assignedTo) {
        // Notify admins about unassigned lead (only if not the performer)
        const admins = await this.usersService.findAdmins(companyId);
        for (const admin of admins) {
          if (admin.id !== userId) {
            await this.notificationsService.create(companyId, {
              userId: admin.id,
              title: 'Lead Unassigned',
              message: `Lead for ${clientName} is now unassigned.`,
              type: NotificationType.LEAD_UNASSIGNED,
              entityType: 'lead',
              entityId: lead.id,
            });
          }
        }
      }
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

    const clientName = `${lead.firstName} ${lead.lastName || ''}`.trim();

    // Broadcast update to all users in the company
    this.notificationsGateway.broadcastToCompany(companyId, 'leadUpdated', {
      id,
      status: lead.status,
      assignedTo: lead.assignedTo,
      updatedBy: performedBy,
    });

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

    if (agentId !== performedBy) {
      await this.notificationsService.create(companyId, {
        userId: agentId,
        title: 'New Lead Assigned',
        message: `You have been assigned a lead: ${clientName}`,
        type: NotificationType.LEAD_ASSIGNED,
        entityType: 'lead',
        entityId: lead.id,
      });
    }

    return this.findOne(id, companyId);
  }

  async convert(id: string, companyId: string, performedBy?: string): Promise<Lead> {
    const lead = await this.findLeadEntityOrThrow(id, companyId);
    const previousStatus = lead.status;
    lead.status = LeadStatus.WON;
    const updated = await this.leadRepository.save(lead);

    // Broadcast update to all users in the company
    this.notificationsGateway.broadcastToCompany(companyId, 'leadUpdated', {
      id,
      status: updated.status,
      assignedTo: updated.assignedTo,
      updatedBy: performedBy,
    });

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

  private serializeLead(lead: Lead): LeadResponse {
    const { assignedAgent, ...leadWithoutAssignedAgent } = lead;
    return {
      ...leadWithoutAssignedAgent,
      assignedAgentName: assignedAgent?.name ?? null,
    };
  }
}
