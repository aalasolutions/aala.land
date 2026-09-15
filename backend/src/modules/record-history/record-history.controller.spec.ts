import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { RecordHistoryController } from './record-history.controller';
import { RecordHistoryService } from './record-history.service';
import { RecordHistoryAction } from './entities/record-history.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Role } from '@shared/enums/roles.enum';
import { ResponseInterceptor } from '@shared/interceptors/response.interceptor';

describe('RecordHistoryController (e2e)', () => {
  let app: INestApplication;

  const mockUser: {
    userId: string;
    companyId: string | null;
    email: string;
    role: string;
    regionCodes: string[];
  } = {
    userId: '123e4567-e89b-12d3-a456-426614174002',
    companyId: '123e4567-e89b-12d3-a456-426614174001',
    email: 'admin@test.com',
    role: Role.COMPANY_ADMIN,
    regionCodes: [],
  };

  const mockRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    companyId: mockUser.companyId,
    action: RecordHistoryAction.DELETE,
    entityType: 'Unit',
    entityId: '123e4567-e89b-12d3-a456-426614174003',
    entityTitle: 'Unit A-1204',
    contextTitle: null,
    reason: 'duplicate',
    actorId: mockUser.userId,
    actorName: 'Admin',
    regionCode: 'dubai',
    metadata: null,
    createdAt: new Date(),
  };

  const mockRecordHistoryService = {
    findAll: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RecordHistoryController],
      providers: [
        {
          provide: RecordHistoryService,
          useValue: mockRecordHistoryService,
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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockUser.companyId = '123e4567-e89b-12d3-a456-426614174001';
  });

  describe('GET /record-history', () => {
    it('returns paginated history for the JWT company', async () => {
      mockRecordHistoryService.findAll.mockResolvedValue({
        data: [mockRow],
        total: 1,
        page: 1,
        limit: 20,
      });

      const response = await request(app.getHttpServer())
        .get('/record-history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.data[0].id).toBe(mockRow.id);
      expect(mockRecordHistoryService.findAll).toHaveBeenCalledWith(
        mockUser.companyId,
        { page: 1, limit: 20 },
        mockUser.role,
      );
    });

    it('passes every filter through', async () => {
      mockRecordHistoryService.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        limit: 10,
      });

      await request(app.getHttpServer())
        .get(
          `/record-history?page=2&limit=10&action=ARCHIVE&entityType=Lease&entityId=${mockRow.entityId}&regionCode=dubai`,
        )
        .expect(200);

      expect(mockRecordHistoryService.findAll).toHaveBeenCalledWith(
        mockUser.companyId,
        {
          page: 2,
          limit: 10,
          action: RecordHistoryAction.ARCHIVE,
          entityType: 'Lease',
          entityId: mockRow.entityId,
          regionCode: 'dubai',
        },
        mockUser.role,
      );
    });

    it('rejects an unknown action', async () => {
      await request(app.getHttpServer())
        .get('/record-history?action=PURGE')
        .expect(400);
      expect(mockRecordHistoryService.findAll).not.toHaveBeenCalled();
    });

    it('rejects a non-uuid entityId', async () => {
      await request(app.getHttpServer())
        .get('/record-history?entityId=abc')
        .expect(400);
    });

    it('rejects a limit above 100', async () => {
      await request(app.getHttpServer())
        .get('/record-history?limit=500')
        .expect(400);
    });

    it('returns 403 without a company context', async () => {
      mockUser.companyId = null;

      await request(app.getHttpServer()).get('/record-history').expect(403);
      expect(mockRecordHistoryService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('write routes', () => {
    it('exposes no delete or purge endpoint', async () => {
      await request(app.getHttpServer())
        .delete('/record-history/purge')
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/record-history/${mockRow.id}`)
        .expect(404);
    });
  });
});
