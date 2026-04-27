import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Lead, LeadStatus, LeadTemperature, LeadSource } from './entities/lead.entity';
import { LeadActivity, ActivityType } from './entities/lead-activity.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';

describe('LeadsService', () => {
  let service: LeadsService;
  let leadRepo: jest.Mocked<Repository<Lead>>;
  let activityRepo: jest.Mocked<Repository<LeadActivity>>;
  let companyRepo: jest.Mocked<Repository<Company>>;
  let userRepo: jest.Mocked<Repository<User>>;

  const companyId = 'company-uuid-1';

  const mockLead: Partial<Lead> = {
    id: 'lead-uuid-1',
    companyId,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'ahmed@example.com',
    status: LeadStatus.NEW,
    temperature: LeadTemperature.WARM,
    source: LeadSource.WHATSAPP,
    score: 50,
  };

  const mockActivity: Partial<LeadActivity> = {
    id: 'activity-uuid-1',
    leadId: 'lead-uuid-1',
    companyId,
    type: ActivityType.NOTE,
    notes: 'First contact made',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        {
          provide: getRepositoryToken(Lead),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeadActivity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
    leadRepo = module.get(getRepositoryToken(Lead));
    activityRepo = module.get(getRepositoryToken(LeadActivity));
    companyRepo = module.get(getRepositoryToken(Company));
    userRepo = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a lead', async () => {
      companyRepo.findOne.mockResolvedValue({ defaultRegionCode: 'dubai' } as Company);
      leadRepo.create.mockReturnValue(mockLead as Lead);
      leadRepo.save.mockResolvedValue(mockLead as Lead);

      const dto = { firstName: 'Ahmed', source: LeadSource.WHATSAPP };
      const result = await service.create(companyId, dto as any);

      expect(leadRepo.create).toHaveBeenCalledWith({ ...dto, companyId, regionCode: 'dubai' });
      expect(result).toEqual(mockLead);
    });
  });

  describe('findAll', () => {
    it('returns paginated leads for company', async () => {
      leadRepo.findAndCount.mockResolvedValue([[mockLead as Lead], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(leadRepo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        relations: ['property', 'unit', 'assignedAgent'],
        ...{ skip: 0, take: 20 },
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([{ ...mockLead, assignedAgentName: null }]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns lead when found', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);

      const result = await service.findOne('lead-uuid-1', companyId);

      expect(result).toEqual({ ...mockLead, assignedAgentName: null });
    });

    it('throws NotFoundException when lead not found', async () => {
      leadRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when lead belongs to different company', async () => {
      leadRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('lead-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates lead fields', async () => {
      leadRepo.findOne
        .mockResolvedValueOnce({ ...mockLead } as Lead)
        .mockResolvedValueOnce({ ...mockLead, score: 75 } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, score: 75 } as Lead);

      const result = await service.update('lead-uuid-1', companyId, { score: 75 } as any);

      expect(result.score).toBe(75);
      expect(result.assignedAgentName).toBeNull();
    });

    it('creates activity log when status changes', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithStatus)
        .mockResolvedValueOnce({ ...leadWithStatus, status: LeadStatus.CONTACTED } as Lead);
      leadRepo.save.mockResolvedValue({ ...leadWithStatus, status: LeadStatus.CONTACTED } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update('lead-uuid-1', companyId, { status: LeadStatus.CONTACTED } as any);

      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.STATUS_CHANGE }),
      );
    });

    it('sets stageEnteredAt when status changes', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithStatus)
        .mockResolvedValueOnce({ ...leadWithStatus, status: LeadStatus.CONTACTED } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update('lead-uuid-1', companyId, { status: LeadStatus.CONTACTED } as any);

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.stageEnteredAt).toBeInstanceOf(Date);
    });

    it('does not set stageEnteredAt when status does not change', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithStatus)
        .mockResolvedValueOnce(leadWithStatus);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);

      await service.update('lead-uuid-1', companyId, { score: 80 } as any);

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.stageEnteredAt).toBeUndefined();
    });

    it('clears property and unit relations when ids are explicitly unset', async () => {
      const leadWithRelations = {
        ...mockLead,
        propertyId: 'locality-uuid-1',
        unitId: 'unit-uuid-1',
        property: { id: 'locality-uuid-1', name: 'Dubai Marina' },
        unit: { id: 'unit-uuid-1', unitNumber: '1204' },
      } as unknown as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithRelations)
        .mockResolvedValueOnce({ ...leadWithRelations, propertyId: null, unitId: null, property: null, unit: null } as unknown as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);

      await service.update('lead-uuid-1', companyId, { propertyId: null, unitId: null } as any);

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.propertyId).toBeNull();
      expect(savedLead.unitId).toBeNull();
      expect(savedLead.property).toBeNull();
      expect(savedLead.unit).toBeNull();
    });

    it('rejects null status updates before saving', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);

      await expect(service.update('lead-uuid-1', companyId, { status: null } as any)).rejects.toThrow(
        BadRequestException,
      );

      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('forbids non-admin assignment changes through update', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);

      await expect(
        service.update('lead-uuid-1', companyId, { assignedTo: 'agent-uuid-1' } as any, 'user-uuid-1', Role.AGENT),
      ).rejects.toThrow(ForbiddenException);

      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('validates assigned agent when admin updates assignment', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(
          'lead-uuid-1',
          companyId,
          { assignedTo: 'missing-agent' } as any,
          'user-uuid-1',
          Role.COMPANY_ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('logs assignment activity when admin updates assignment', async () => {
      const leadWithAgent = { ...mockLead, assignedTo: 'old-agent-uuid' } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithAgent)
        .mockResolvedValueOnce({ ...leadWithAgent, assignedTo: 'new-agent-uuid' } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({ id: 'new-agent-uuid', name: 'New Agent' } as User);
      activityRepo.create.mockImplementation((activity) => activity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update(
        'lead-uuid-1',
        companyId,
        { assignedTo: 'new-agent-uuid' } as any,
        'admin-uuid',
        Role.COMPANY_ADMIN,
      );

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.previousAgent).toBe('old-agent-uuid');
      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityType.ASSIGNMENT,
          notes: 'Lead assigned to agent New Agent',
          performedBy: 'admin-uuid',
        }),
      );
    });
  });

  describe('assign', () => {
    it('assigns lead to agent and logs activity', async () => {
      leadRepo.findOne
        .mockResolvedValueOnce({ ...mockLead } as Lead)
        .mockResolvedValueOnce({ ...mockLead, assignedTo: 'agent-uuid-1' } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, assignedTo: 'agent-uuid-1' } as Lead);
      userRepo.findOne.mockResolvedValue({ id: 'agent-uuid-1', name: 'Agent One' } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const result = await service.assign('lead-uuid-1', companyId, 'agent-uuid-1');

      expect(result.assignedTo).toBe('agent-uuid-1');
      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.ASSIGNMENT }),
      );
    });

    it('throws when assigned agent does not exist in the company', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.assign('lead-uuid-1', companyId, 'missing-agent')).rejects.toThrow(NotFoundException);
      expect(leadRepo.save).not.toHaveBeenCalled();
      expect(activityRepo.save).not.toHaveBeenCalled();
    });

    it('saves previousAgent and transferReason when reassigning', async () => {
      const leadWithAgent = { ...mockLead, assignedTo: 'old-agent-uuid' } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithAgent)
        .mockResolvedValueOnce({ ...leadWithAgent, assignedTo: 'new-agent-uuid' } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({ id: 'new-agent-uuid', name: 'New Agent' } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.assign('lead-uuid-1', companyId, 'new-agent-uuid', 'admin-uuid', 'Client prefers Arabic speaker');

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.previousAgent).toBe('old-agent-uuid');
      expect(savedLead.transferReason).toBe('Client prefers Arabic speaker');
      expect(savedLead.assignedTo).toBe('new-agent-uuid');
    });

    it('includes reason in activity notes when provided', async () => {
      leadRepo.findOne
        .mockResolvedValueOnce({ ...mockLead } as Lead)
        .mockResolvedValueOnce({ ...mockLead, assignedTo: 'agent-uuid-1' } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, assignedTo: 'agent-uuid-1' } as Lead);
      userRepo.findOne.mockResolvedValue({ id: 'agent-uuid-1', name: 'Agent One' } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.assign('lead-uuid-1', companyId, 'agent-uuid-1', 'admin-uuid', 'Test reason');

      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityType.ASSIGNMENT,
          notes: expect.stringContaining('reason: Test reason'),
        }),
      );
    });

    it('does not set previousAgent when no existing agent', async () => {
      const leadNoAgent = { ...mockLead, assignedTo: null } as unknown as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadNoAgent)
        .mockResolvedValueOnce({ ...leadNoAgent, assignedTo: 'agent-uuid-1' } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({ id: 'agent-uuid-1', name: 'Agent One' } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.assign('lead-uuid-1', companyId, 'agent-uuid-1');

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.previousAgent).toBeUndefined();
    });
  });

  describe('convert', () => {
    it('converts lead to WON status', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, status: LeadStatus.WON } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const result = await service.convert('lead-uuid-1', companyId);

      expect(result.status).toBe(LeadStatus.WON);
    });
  });

  describe('addActivity', () => {
    it('adds activity to lead', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const dto = { type: ActivityType.NOTE, notes: 'First contact' };
      const result = await service.addActivity('lead-uuid-1', companyId, dto);

      expect(activityRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockActivity);
    });

    it('throws NotFoundException when lead not found', async () => {
      leadRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addActivity('bad-id', companyId, { type: ActivityType.NOTE, notes: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActivities', () => {
    it('returns activities for lead', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);
      activityRepo.find.mockResolvedValue([mockActivity as LeadActivity]);

      const result = await service.findActivities('lead-uuid-1', companyId);

      expect(activityRepo.find).toHaveBeenCalledWith({
        where: { leadId: 'lead-uuid-1', companyId },
        relations: ['performer'],
        order: { createdAt: 'DESC' },
        take: 200,
      });
      expect(result).toEqual([{ ...mockActivity, performedByName: null }]);
    });
  });
});
