import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReminderRulesService } from './reminder-rules.service';
import { ReminderRule, ReminderRuleType } from './entities/reminder-rule.entity';

describe('ReminderRulesService', () => {
  let service: ReminderRulesService;
  let repo: jest.Mocked<Repository<ReminderRule>>;

  const companyId = 'company-uuid-1';

  const mockRule: Partial<ReminderRule> = {
    id: 'rule-uuid-1',
    companyId,
    name: 'Rent Due 3 Days Before',
    type: ReminderRuleType.RENT_DUE,
    triggerDaysBefore: 3,
    isActive: true,
    message: 'Rent payment of {{amount}} AED is due on {{date}}',
    createdAt: new Date('2026-03-11T10:00:00Z'),
    updatedAt: new Date('2026-03-11T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderRulesService,
        {
          provide: getRepositoryToken(ReminderRule),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReminderRulesService>(ReminderRulesService);
    repo = module.get(getRepositoryToken(ReminderRule));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a reminder rule', async () => {
      const dto = {
        name: 'Rent Due 3 Days Before',
        type: ReminderRuleType.RENT_DUE,
        triggerDaysBefore: 3,
        message: 'Rent payment of {{amount}} AED is due on {{date}}',
      };

      repo.create.mockReturnValue(mockRule as ReminderRule);
      repo.save.mockResolvedValue(mockRule as ReminderRule);

      const result = await service.create(companyId, dto);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(repo.save).toHaveBeenCalledWith(mockRule);
      expect(result).toEqual(mockRule);
    });
  });

  describe('findAll', () => {
    it('returns paginated reminder rules for company', async () => {
      repo.findAndCount.mockResolvedValue([[mockRule as ReminderRule], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockRule]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('calculates correct skip for page 2', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(companyId, 2, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns rule when found within company', async () => {
      repo.findOne.mockResolvedValue(mockRule as ReminderRule);

      const result = await service.findOne('rule-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'rule-uuid-1', companyId },
      });
      expect(result).toEqual(mockRule);
    });

    it('throws NotFoundException when rule not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('rule-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the rule', async () => {
      const updated = { ...mockRule, name: 'Rent Due 5 Days Before' } as ReminderRule;
      repo.findOne.mockResolvedValue({ ...mockRule } as ReminderRule);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('rule-uuid-1', companyId, { name: 'Rent Due 5 Days Before' });

      expect(result.name).toBe('Rent Due 5 Days Before');
    });

    it('throws NotFoundException when rule does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', companyId, { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft deletes by setting isActive to false', async () => {
      const activeRule = { ...mockRule, isActive: true } as ReminderRule;
      repo.findOne.mockResolvedValue(activeRule);
      repo.save.mockImplementation(async (r) => r as ReminderRule);

      const result = await service.remove('rule-uuid-1', companyId);

      expect(result.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(activeRule);
    });

    it('throws NotFoundException when rule does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActiveByType', () => {
    it('returns active rules for a given type', async () => {
      repo.find.mockResolvedValue([mockRule as ReminderRule]);

      const result = await service.findActiveByType(companyId, ReminderRuleType.RENT_DUE);

      expect(repo.find).toHaveBeenCalledWith({
        where: { companyId, type: ReminderRuleType.RENT_DUE, isActive: true },
        order: { triggerDaysBefore: 'DESC' },
      });
      expect(result).toEqual([mockRule]);
    });

    it('returns empty array when no active rules of that type', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findActiveByType(companyId, ReminderRuleType.LEASE_EXPIRY);

      expect(result).toEqual([]);
    });
  });
});
