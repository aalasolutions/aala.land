import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Role } from '@shared/enums/roles.enum';
import { ResponseInterceptor } from '@shared/interceptors/response.interceptor';

describe('AuditController (e2e)', () => {
  let app: INestApplication;
  let auditService: AuditService;
  let repository: jest.Mocked<Repository<AuditLog>>;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    companyId: '123e4567-e89b-12d3-a456-426614174001',
    email: 'admin@test.com',
    role: Role.COMPANY_ADMIN,
  };

  const mockAuditLog: AuditLog = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    companyId: mockUser.companyId,
    userId: mockUser.id,
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

  const mockAuditService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    auditService = moduleFixture.get<AuditService>(AuditService);
    repository = moduleFixture.get(getRepositoryToken(AuditLog));
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /audit-logs', () => {
    it('should return paginated audit logs for company admin', async () => {
      mockAuditService.findAll.mockResolvedValue({
        data: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 20,
      });

      const response = await request(app.getHttpServer())
        .get('/audit-logs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(20);
      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].id).toBe(mockAuditLog.id);
      expect(mockAuditService.findAll).toHaveBeenCalledWith(mockUser.companyId, {
        page: 1,
        limit: 20,
      });
    });

    it('should filter audit logs by action', async () => {
      mockAuditService.findAll.mockResolvedValue({
        data: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 20,
      });

      const response = await request(app.getHttpServer())
        .get('/audit-logs?action=CREATE')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAuditService.findAll).toHaveBeenCalledWith(mockUser.companyId, {
        page: 1,
        limit: 20,
        action: AuditAction.CREATE,
      });
    });

    it('should filter audit logs by entityType', async () => {
      mockAuditService.findAll.mockResolvedValue({
        data: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 20,
      });

      const response = await request(app.getHttpServer())
        .get('/audit-logs?entityType=lead')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAuditService.findAll).toHaveBeenCalledWith(mockUser.companyId, {
        page: 1,
        limit: 20,
        entityType: 'lead',
      });
    });

    it('should filter audit logs by entityId', async () => {
      mockAuditService.findAll.mockResolvedValue({
        data: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 20,
      });

      const response = await request(app.getHttpServer())
        .get(`/audit-logs?entityId=${mockAuditLog.entityId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAuditService.findAll).toHaveBeenCalledWith(mockUser.companyId, {
        page: 1,
        limit: 20,
        entityId: mockAuditLog.entityId,
      });
    });

    it('should filter audit logs by userId', async () => {
      mockAuditService.findAll.mockResolvedValue({
        data: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 20,
      });

      const response = await request(app.getHttpServer())
        .get(`/audit-logs?userId=${mockAuditLog.userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAuditService.findAll).toHaveBeenCalledWith(mockUser.companyId, {
        page: 1,
        limit: 20,
        userId: mockAuditLog.userId,
      });
    });

    it('should apply pagination', async () => {
      mockAuditService.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        limit: 10,
      });

      const response = await request(app.getHttpServer())
        .get('/audit-logs?page=2&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAuditService.findAll).toHaveBeenCalledWith(mockUser.companyId, {
        page: 2,
        limit: 10,
      });
    });
  });

  describe('GET /audit-logs/:id', () => {
    it('should return single audit log by ID', async () => {
      mockAuditService.findOne.mockResolvedValue(mockAuditLog);

      const response = await request(app.getHttpServer())
        .get(`/audit-logs/${mockAuditLog.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockAuditLog.id);
      expect(response.body.data.action).toBe(mockAuditLog.action);
      expect(mockAuditService.findOne).toHaveBeenCalledWith(
        mockAuditLog.id,
        mockUser.companyId,
      );
    });

    it('should return 404 when audit log not found', async () => {
      mockAuditService.findOne.mockRejectedValue(
        new NotFoundException('Audit log with ID non-existent-id not found'),
      );

      await request(app.getHttpServer())
        .get('/audit-logs/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
