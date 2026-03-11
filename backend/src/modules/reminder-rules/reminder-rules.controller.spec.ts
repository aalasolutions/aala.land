import { Test, TestingModule } from '@nestjs/testing';
import { ReminderRulesController } from './reminder-rules.controller';
import { ReminderRulesService } from './reminder-rules.service';
import { ReminderRuleType } from './entities/reminder-rule.entity';

describe('ReminderRulesController', () => {
  let controller: ReminderRulesController;
  let service: jest.Mocked<ReminderRulesService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockRule = {
    id: 'rule-uuid-1',
    companyId,
    name: 'Rent Due 3 Days Before',
    type: ReminderRuleType.RENT_DUE,
    triggerDaysBefore: 3,
    isActive: true,
    message: 'Rent due on {{date}}',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReminderRulesController],
      providers: [
        {
          provide: ReminderRulesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReminderRulesController>(ReminderRulesController);
    service = module.get(ReminderRulesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('calls service.create with companyId and dto', async () => {
      const dto = {
        name: 'Rent Due 3 Days Before',
        type: ReminderRuleType.RENT_DUE,
        triggerDaysBefore: 3,
      };
      service.create.mockResolvedValue(mockRule as any);

      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockRule);
    });
  });

  describe('findAll', () => {
    it('calls service.findAll with pagination', async () => {
      const paginated = { data: [mockRule], total: 1, page: 1, limit: 20 };
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20);
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('calls service.findOne with id and companyId', async () => {
      service.findOne.mockResolvedValue(mockRule as any);

      const result = await controller.findOne('rule-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('rule-uuid-1', companyId);
      expect(result).toEqual(mockRule);
    });
  });

  describe('update', () => {
    it('calls service.update with id, companyId, and dto', async () => {
      const dto = { name: 'Updated Rule' };
      const updated = { ...mockRule, name: 'Updated Rule' };
      service.update.mockResolvedValue(updated as any);

      const result = await controller.update('rule-uuid-1', dto as any, mockReq);

      expect(service.update).toHaveBeenCalledWith('rule-uuid-1', companyId, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('calls service.remove with id and companyId', async () => {
      const deactivated = { ...mockRule, isActive: false };
      service.remove.mockResolvedValue(deactivated as any);

      const result = await controller.remove('rule-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('rule-uuid-1', companyId);
      expect(result.isActive).toBe(false);
    });
  });
});
