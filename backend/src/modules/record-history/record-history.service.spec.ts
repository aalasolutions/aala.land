import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { InternalServerErrorException } from '@nestjs/common';
import { RecordHistoryService } from './record-history.service';
import {
  RecordHistory,
  RecordHistoryAction,
} from './entities/record-history.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';

describe('RecordHistoryService', () => {
  let service: RecordHistoryService;

  const companyId = '123e4567-e89b-12d3-a456-426614174001';
  const actorId = '123e4567-e89b-12d3-a456-426614174002';
  const entityId = '123e4567-e89b-12d3-a456-426614174003';

  const mockRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockManager = {
    insert: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
  };
  const manager = mockManager as unknown as EntityManager;

  const baseInput = {
    companyId,
    action: RecordHistoryAction.DELETE,
    entityType: 'Unit',
    entityId,
    entityTitle: 'Unit A-1204',
    actorId,
    actorName: 'Test User',
  };

  const buildQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordHistoryService,
        {
          provide: getRepositoryToken(RecordHistory),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<RecordHistoryService>(RecordHistoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('record', () => {
    it('writes through the given manager with the company default region', async () => {
      mockManager.findOne.mockResolvedValueOnce({ defaultRegionCode: 'dubai' });

      await service.record(manager, {
        ...baseInput,
        contextTitle: 'Marina Tower',
        reason: '  duplicate entry  ',
        metadata: { fileCount: 2 },
      });

      expect(mockManager.findOne).toHaveBeenCalledWith(Company, {
        where: { id: companyId },
        select: { id: true, defaultRegionCode: true },
      });
      expect(mockManager.insert).toHaveBeenCalledWith(RecordHistory, {
        companyId,
        action: RecordHistoryAction.DELETE,
        entityType: 'Unit',
        entityId,
        entityTitle: 'Unit A-1204',
        contextTitle: 'Marina Tower',
        reason: 'duplicate entry',
        actorId,
        actorName: 'Test User',
        regionCode: 'dubai',
        metadata: { fileCount: 2 },
      });
    });

    it('keeps an explicit region without looking up the company', async () => {
      await service.record(manager, { ...baseInput, regionCode: 'abu-dhabi' });

      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(mockManager.insert.mock.calls[0][1].regionCode).toBe('abu-dhabi');
    });

    it('keeps an explicit null region', async () => {
      await service.record(manager, { ...baseInput, regionCode: null });

      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(mockManager.insert.mock.calls[0][1].regionCode).toBeNull();
    });

    it('uses a null region for global entity types', async () => {
      await service.record(manager, {
        ...baseInput,
        companyId: null,
        entityType: 'Asset',
      });

      expect(mockManager.findOne).not.toHaveBeenCalled();
      const row = mockManager.insert.mock.calls[0][1];
      expect(row.companyId).toBeNull();
      expect(row.regionCode).toBeNull();
    });

    it('stores null region when the company has no default', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      await service.record(manager, baseInput);

      expect(mockManager.insert.mock.calls[0][1].regionCode).toBeNull();
    });

    it('rejects a missing companyId for a company-scoped type', async () => {
      await expect(
        service.record(manager, { ...baseInput, companyId: null }),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        service.record(manager, { ...baseInput, companyId: null }),
      ).rejects.toThrow('requires companyId');
      expect(mockManager.insert).not.toHaveBeenCalled();
    });

    it.each([[''], ['   '], [undefined], [null]])(
      'stores reason %p as null',
      async (reason) => {
        await service.record(manager, {
          ...baseInput,
          regionCode: null,
          reason,
        });

        expect(mockManager.insert.mock.calls[0][1].reason).toBeNull();
      },
    );

    it('defaults optional fields to null', async () => {
      await service.record(manager, {
        companyId,
        action: RecordHistoryAction.ARCHIVE,
        entityType: 'Lease',
        entityId,
        entityTitle: 'Lease L-1',
        actorName: 'System',
        regionCode: null,
      });

      const row = mockManager.insert.mock.calls[0][1];
      expect(row.contextTitle).toBeNull();
      expect(row.actorId).toBeNull();
      expect(row.metadata).toBeNull();
    });

    it('truncates titles to the column length', async () => {
      await service.record(manager, {
        ...baseInput,
        regionCode: null,
        entityTitle: 'x'.repeat(300),
      });

      expect(mockManager.insert.mock.calls[0][1].entityTitle).toHaveLength(
        255,
      );
    });
  });

  describe('resolveActorName', () => {
    it('returns the user name', async () => {
      mockManager.findOne.mockResolvedValueOnce({
        id: actorId,
        name: 'Test User',
        email: 'user@example.com',
      });

      await expect(service.resolveActorName(manager, actorId)).resolves.toBe(
        'Test User',
      );
      expect(mockManager.findOne).toHaveBeenCalledWith(User, {
        where: { id: actorId },
        select: { id: true, name: true, email: true },
      });
    });

    it('falls back to email when the name is blank', async () => {
      mockManager.findOne.mockResolvedValueOnce({
        id: actorId,
        name: ' ',
        email: 'user@example.com',
      });

      await expect(service.resolveActorName(manager, actorId)).resolves.toBe(
        'user@example.com',
      );
    });

    it('falls back to a placeholder when the user is missing', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      await expect(service.resolveActorName(manager, actorId)).resolves.toBe(
        'Unknown user',
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated rows scoped to the company, newest first', async () => {
      const qb = buildQueryBuilder();
      qb.getManyAndCount.mockResolvedValueOnce([[{ id: 'row' }], 1]);
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(companyId, { page: 2, limit: 10 });

      expect(result).toEqual({
        data: [{ id: 'row' }],
        total: 1,
        page: 2,
        limit: 10,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'recordHistory.companyId = :companyId',
        { companyId },
      );
      expect(qb.orderBy).toHaveBeenCalledWith(
        'recordHistory.createdAt',
        'DESC',
      );
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('applies action, entityType and entityId filters', async () => {
      const qb = buildQueryBuilder();
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(companyId, {
        action: RecordHistoryAction.CANCEL,
        entityType: 'Cheque',
        entityId,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'recordHistory.action = :action',
        { action: RecordHistoryAction.CANCEL },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'recordHistory.entityType = :entityType',
        { entityType: 'Cheque' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'recordHistory.entityId = :entityId',
        { entityId },
      );
    });

    it('ignores the region for all-region roles', async () => {
      const qb = buildQueryBuilder();
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(
        companyId,
        { regionCode: 'dubai' },
        Role.COMPANY_ADMIN,
      );

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('lets an admin read the region plus NULL-region rows', async () => {
      const qb = buildQueryBuilder();
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(companyId, { regionCode: 'dubai' }, Role.ADMIN);

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(recordHistory.regionCode = :regionCode OR recordHistory.regionCode IS NULL)',
        { regionCode: 'dubai' },
      );
    });

    it('limits a manager to the exact region', async () => {
      const qb = buildQueryBuilder();
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(companyId, { regionCode: 'dubai' }, Role.MANAGER);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'recordHistory.regionCode = :regionCode',
        { regionCode: 'dubai' },
      );
    });
  });
});
