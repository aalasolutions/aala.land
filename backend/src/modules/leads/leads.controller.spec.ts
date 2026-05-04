import { Test, TestingModule } from '@nestjs/testing';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeadStatus, LeadTemperature, LeadSource } from './entities/lead.entity';
import { ActivityType } from './entities/lead-activity.entity';
import { Role } from '@shared/enums/roles.enum';

describe('LeadsController', () => {
  let controller: LeadsController;
  let service: jest.Mocked<LeadsService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1', role: Role.COMPANY_ADMIN } };

  const mockLead = {
    id: 'lead-uuid-1',
    companyId,
    firstName: 'Ahmed',
    status: LeadStatus.NEW,
    temperature: LeadTemperature.WARM,
    source: LeadSource.WHATSAPP,
  };

  const mockActivity = {
    id: 'activity-uuid-1',
    leadId: 'lead-uuid-1',
    companyId,
    type: ActivityType.NOTE,
    description: 'First contact',
  };

  const paginated = { data: [mockLead], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [
        {
          provide: LeadsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            assign: jest.fn(),
            convert: jest.fn(),
            addActivity: jest.fn(),
            findActivities: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeadsController>(LeadsController);
    service = module.get(LeadsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates lead scoped to company', async () => {
      service.create.mockResolvedValue(mockLead as any);

      const dto = { firstName: 'Ahmed' };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto, 'user-uuid-1');
      expect(result).toEqual(mockLead);
    });
  });

  describe('findAll', () => {
    it('returns paginated leads', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, undefined);
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('returns lead by id', async () => {
      service.findOne.mockResolvedValue(mockLead as any);

      const result = await controller.findOne('lead-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('lead-uuid-1', companyId);
    });
  });

  describe('update', () => {
    it('passes the caller role to the service', async () => {
      service.update.mockResolvedValue({ ...mockLead, score: 75 } as any);

      const dto = { score: 75 };
      const result = await controller.update('lead-uuid-1', dto as any, mockReq);

      expect(service.update).toHaveBeenCalledWith('lead-uuid-1', companyId, dto, 'user-uuid-1', Role.COMPANY_ADMIN);
      expect(result).toEqual({ ...mockLead, score: 75 });
    });
  });

  describe('assign', () => {
    it('assigns lead to agent without reason', async () => {
      service.assign.mockResolvedValue({ ...mockLead, assignedTo: 'agent-uuid-1' } as any);

      const dto = { agentId: 'agent-uuid-1' };
      const result = await controller.assign('lead-uuid-1', dto as any, mockReq);

      expect(service.assign).toHaveBeenCalledWith('lead-uuid-1', companyId, 'agent-uuid-1', 'user-uuid-1', undefined);
    });

    it('assigns lead to agent with transfer reason', async () => {
      service.assign.mockResolvedValue({ ...mockLead, assignedTo: 'agent-uuid-1' } as any);

      const dto = { agentId: 'agent-uuid-1', reason: 'Client prefers Arabic speaker' };
      const result = await controller.assign('lead-uuid-1', dto as any, mockReq);

      expect(service.assign).toHaveBeenCalledWith('lead-uuid-1', companyId, 'agent-uuid-1', 'user-uuid-1', 'Client prefers Arabic speaker');
    });
  });

  describe('convert', () => {
    it('converts lead to WON', async () => {
      service.convert.mockResolvedValue({ ...mockLead, status: LeadStatus.WON } as any);

      await controller.convert('lead-uuid-1', mockReq);

      expect(service.convert).toHaveBeenCalledWith('lead-uuid-1', companyId, 'user-uuid-1');
    });
  });

  describe('addActivity', () => {
    it('adds activity to lead', async () => {
      service.addActivity.mockResolvedValue(mockActivity as any);

      const dto = { type: ActivityType.NOTE, description: 'First contact' };
      const result = await controller.addActivity('lead-uuid-1', dto, mockReq);

      expect(service.addActivity).toHaveBeenCalledWith('lead-uuid-1', companyId, dto, 'user-uuid-1');
    });
  });

  describe('findActivities', () => {
    it('returns activities for lead', async () => {
      service.findActivities.mockResolvedValue([mockActivity] as any);

      const result = await controller.findActivities('lead-uuid-1', mockReq);

      expect(service.findActivities).toHaveBeenCalledWith('lead-uuid-1', companyId);
    });
  });
});
