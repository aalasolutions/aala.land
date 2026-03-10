import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './dto/query-audit-logs.dto';
import { NotFoundException } from '@nestjs/common';

describe('AuditService', () => {
  let service: AuditService;
  let repository: jest.Mocked<Repository<AuditLog>>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAuditLog: AuditLog = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    companyId: '123e4567-e89b-12d3-a456-426614174001',
    userId: '123e4567-e89b-12d3-a456-426614174002',
    action: AuditAction.CREATE,
    entityType: 'lead',
    entityId: '123e4567-e89b-12d3-a456-426614174003',
    oldValue: null as any,
    newValue: { name: 'Test Lead' },
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date(),
    company: null as any,
    user: null as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get(getRepositoryToken(AuditLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      const createAuditLogDto = {
        companyId: '123e4567-e89b-12d3-a456-426614174001',
        userId: '123e4567-e89b-12d3-a456-426614174002',
        action: AuditAction.CREATE,
        entityType: 'lead',
        entityId: '123e4567-e89b-12d3-a456-426614174003',
        newValue: { name: 'Test Lead' },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      mockRepository.create.mockReturnValue(mockAuditLog);
      mockRepository.save.mockResolvedValue(mockAuditLog);

      const result = await service.log(createAuditLogDto);

      expect(result).toEqual(mockAuditLog);
      expect(mockRepository.create).toHaveBeenCalledWith(createAuditLogDto);
      expect(mockRepository.save).toHaveBeenCalledWith(mockAuditLog);
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs for company', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.findAll('123e4567-e89b-12d3-a456-426614174001', {
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({
        data: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('auditLog');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('auditLog.companyId = :companyId', {
        companyId: '123e4567-e89b-12d3-a456-426614174001',
      });
    });

    it('should filter by action when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.findAll('123e4567-e89b-12d3-a456-426614174001', {
        page: 1,
        limit: 20,
        action: AuditAction.CREATE,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('auditLog.action = :action', {
        action: AuditAction.CREATE,
      });
    });

    it('should filter by entityType when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.findAll('123e4567-e89b-12d3-a456-426614174001', {
        page: 1,
        limit: 20,
        entityType: 'lead',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('auditLog.entityType = :entityType', {
        entityType: 'lead',
      });
    });

    it('should filter by entityId when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.findAll('123e4567-e89b-12d3-a456-426614174001', {
        page: 1,
        limit: 20,
        entityId: '123e4567-e89b-12d3-a456-426614174003',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('auditLog.entityId = :entityId', {
        entityId: '123e4567-e89b-12d3-a456-426614174003',
      });
    });

    it('should filter by userId when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditLog], 1]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.findAll('123e4567-e89b-12d3-a456-426614174001', {
        page: 1,
        limit: 20,
        userId: '123e4567-e89b-12d3-a456-426614174002',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('auditLog.userId = :userId', {
        userId: '123e4567-e89b-12d3-a456-426614174002',
      });
    });
  });

  describe('findOne', () => {
    it('should return an audit log by ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockAuditLog);

      const result = await service.findOne('123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001');

      expect(result).toEqual(mockAuditLog);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174000', companyId: '123e4567-e89b-12d3-a456-426614174001' },
        relations: ['user', 'company'],
      });
    });

    it('should throw NotFoundException when audit log not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent-id', '123e4567-e89b-12d3-a456-426614174001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when audit log belongs to different company', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('123e4567-e89b-12d3-a456-426614174000', 'different-company-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
