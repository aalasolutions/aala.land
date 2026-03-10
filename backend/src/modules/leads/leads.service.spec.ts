import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Lead, LeadStatus, LeadTemperature, LeadSource } from './entities/lead.entity';
import { LeadActivity, ActivityType } from './entities/lead-activity.entity';

describe('LeadsService', () => {
  let service: LeadsService;
  let leadRepo: jest.Mocked<Repository<Lead>>;
  let activityRepo: jest.Mocked<Repository<LeadActivity>>;

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
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
    leadRepo = module.get(getRepositoryToken(Lead));
    activityRepo = module.get(getRepositoryToken(LeadActivity));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a lead', async () => {
      leadRepo.create.mockReturnValue(mockLead as Lead);
      leadRepo.save.mockResolvedValue(mockLead as Lead);

      const dto = { firstName: 'Ahmed', source: LeadSource.WHATSAPP };
      const result = await service.create(companyId, dto as any);

      expect(leadRepo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockLead);
    });
  });

  describe('findAll', () => {
    it('returns paginated leads for company', async () => {
      leadRepo.findAndCount.mockResolvedValue([[mockLead as Lead], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(leadRepo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockLead]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns lead when found', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);

      const result = await service.findOne('lead-uuid-1', companyId);

      expect(result).toEqual(mockLead);
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
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, score: 75 } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const result = await service.update('lead-uuid-1', companyId, { score: 75 } as any);

      expect(result.score).toBe(75);
    });

    it('creates activity log when status changes', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne.mockResolvedValue(leadWithStatus);
      leadRepo.save.mockResolvedValue({ ...leadWithStatus, status: LeadStatus.CONTACTED } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update('lead-uuid-1', companyId, { status: LeadStatus.CONTACTED } as any);

      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.STATUS_CHANGE }),
      );
    });
  });

  describe('assign', () => {
    it('assigns lead to agent and logs activity', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, assignedTo: 'agent-uuid-1' } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const result = await service.assign('lead-uuid-1', companyId, 'agent-uuid-1');

      expect(result.assignedTo).toBe('agent-uuid-1');
      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.ASSIGNMENT }),
      );
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
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([mockActivity]);
    });
  });
});
