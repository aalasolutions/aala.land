import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContactAccessRequestsController } from './contact-access-requests.controller';
import { ContactAccessRequestsService } from './contact-access-requests.service';
import {
  ContactAccessKind,
  ContactAccessRequest,
  ContactAccessStatus,
} from './entities/contact-access-request.entity';
import { CreateContactAccessRequestDto } from './dto/create-contact-access-request.dto';
import { QueryContactAccessRequestsDto } from './dto/query-contact-access-requests.dto';
import { ApproveContactAccessRequestDto } from './dto/approve-contact-access-request.dto';
import { DecideContactAccessRequestDto } from './dto/decide-contact-access-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

describe('ContactAccessRequestsController', () => {
  let controller: ContactAccessRequestsController;
  let service: {
    raiseRequest: jest.Mock;
    findOneForView: jest.Mock;
    findAll: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    revoke: jest.Mock;
  };

  const companyId = 'company-1';
  const contactId = '4b1c7a52-5d0f-4c4e-9a52-6b0f3f1a2c11';
  const requestId = '9e0d6a1b-3c2f-4d5e-8f7a-1b2c3d4e5f60';
  const req = {
    user: {
      userId: 'user-1',
      email: 'user@example.com',
      companyId,
      role: Role.MANAGER,
      regionCodes: ['dubai'],
    },
  };

  const row = {
    id: requestId,
    companyId,
    contactId,
    requesterId: 'user-1',
    regionCode: 'dubai',
    kind: ContactAccessKind.REQUEST,
    status: ContactAccessStatus.PENDING,
    sourceType: 'contact',
    sourceId: contactId,
    note: null,
    decidedBy: null,
    decidedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    contact: {
      id: contactId,
      firstName: 'Test',
      lastName: 'Client',
      regionCode: 'dubai',
    },
    requester: { id: 'user-1', name: 'Test User', email: 'user@example.com' },
    decider: null,
  } as unknown as ContactAccessRequest;

  const roles = (handler: keyof ContactAccessRequestsController) =>
    new Reflector().get<Role[]>(
      ROLES_KEY,
      ContactAccessRequestsController.prototype[handler] as () => unknown,
    );

  beforeEach(async () => {
    service = {
      raiseRequest: jest.fn().mockResolvedValue(row),
      findOneForView: jest.fn().mockResolvedValue(row),
      findAll: jest
        .fn()
        .mockResolvedValue({ data: [row], total: 1, page: 1, limit: 20 }),
      approve: jest.fn().mockResolvedValue(row),
      reject: jest.fn().mockResolvedValue(row),
      revoke: jest.fn().mockResolvedValue(row),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactAccessRequestsController],
      providers: [{ provide: ContactAccessRequestsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContactAccessRequestsController);
  });

  describe('guards and roles', () => {
    it('applies JwtAuthGuard and RolesGuard to the controller', () => {
      const guards = new Reflector().get<unknown[]>(
        '__guards__',
        ContactAccessRequestsController,
      );
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('opens create and list to all six roles', () => {
      const all = [
        Role.SUPER_ADMIN,
        Role.COMPANY_ADMIN,
        Role.ADMIN,
        Role.MANAGER,
        Role.AGENT,
        Role.ACCOUNTANT,
      ];
      expect(roles('create')).toEqual(all);
      expect(roles('findAll')).toEqual(all);
    });

    it.each(['approve', 'reject', 'revoke'] as const)(
      'limits %s to approvers',
      (handler) => {
        expect(roles(handler)).toEqual([
          Role.SUPER_ADMIN,
          Role.COMPANY_ADMIN,
          Role.ADMIN,
          Role.MANAGER,
        ]);
      },
    );
  });

  describe('DTO validation', () => {
    it('requires a uuid contactId and caps the note at 500', async () => {
      expect(
        await validate(plainToInstance(CreateContactAccessRequestDto, {})),
      ).not.toHaveLength(0);
      expect(
        await validate(
          plainToInstance(CreateContactAccessRequestDto, {
            contactId,
            note: 'x'.repeat(501),
          }),
        ),
      ).not.toHaveLength(0);
      expect(
        await validate(
          plainToInstance(CreateContactAccessRequestDto, {
            contactId,
            note: 'ok',
          }),
        ),
      ).toHaveLength(0);
    });

    it('rejects a missing or blank reason and one over 500 chars', async () => {
      for (const body of [{}, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
        expect(
          await validate(plainToInstance(DecideContactAccessRequestDto, body)),
        ).not.toHaveLength(0);
      }
      expect(
        await validate(
          plainToInstance(DecideContactAccessRequestDto, { reason: 'fine' }),
        ),
      ).toHaveLength(0);
    });

    it('rejects a non ISO expiresAt', async () => {
      const errors = await validate(
        plainToInstance(ApproveContactAccessRequestDto, {
          expiresAt: 'next week',
        }),
      );
      expect(errors).not.toHaveLength(0);
    });

    it('transforms mine and accepts the injected regionCode', async () => {
      const dto = plainToInstance(QueryContactAccessRequestsDto, {
        mine: 'true',
        kind: 'LINK',
        page: '2',
        regionCode: 'dubai',
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.mine).toBe(true);
      expect(dto.page).toBe(2);
      const bad = plainToInstance(QueryContactAccessRequestsDto, {
        status: 'NOPE',
      });
      expect(await validate(bad)).not.toHaveLength(0);
    });
  });

  describe('create', () => {
    it('raises with the contact as source and returns the serialized row', async () => {
      const result = await controller.create(
        { contactId, note: 'please' },
        req,
      );

      expect(service.raiseRequest).toHaveBeenCalledWith(
        companyId,
        contactId,
        'user-1',
        { sourceType: 'contact', sourceId: contactId },
        'please',
      );
      expect(service.findOneForView).toHaveBeenCalledWith(companyId, requestId);
      expect(result.contact).toEqual({
        id: contactId,
        displayName: 'Test Client',
        regionCode: 'dubai',
      });
      expect(result.requester).toEqual({ id: 'user-1', name: 'Test User' });
      expect(result).not.toHaveProperty('companyId');
    });

    it('rejects a caller without a company', async () => {
      await expect(
        controller.create(
          { contactId },
          { user: { ...req.user, companyId: null } },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('forwards the query and serializes rows', async () => {
      const result = await controller.findAll(
        { status: ContactAccessStatus.PENDING, mine: true, page: 1, limit: 20 },
        req,
      );

      expect(service.findAll).toHaveBeenCalledWith(companyId, req.user, {
        status: ContactAccessStatus.PENDING,
        kind: undefined,
        mine: true,
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({ id: requestId, decidedBy: null });
    });
  });

  describe('approve', () => {
    it('defaults the expiry to 90 days', async () => {
      const before = Date.now();
      await controller.approve(requestId, {}, req);

      const expiresAt = service.approve.mock.calls[0][3] as Date;
      const days = (expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(90);
      expect(service.approve.mock.calls[0].slice(0, 3)).toEqual([
        companyId,
        req.user,
        requestId,
      ]);
    });

    it('passes null for forever', async () => {
      await controller.approve(requestId, { forever: true }, req);
      expect(service.approve.mock.calls[0][3]).toBeNull();
    });

    it('400s a past expiresAt without calling the service', async () => {
      await expect(
        controller.approve(
          requestId,
          { expiresAt: '2020-01-01T00:00:00Z' },
          req,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(service.approve).not.toHaveBeenCalled();
    });
  });

  describe('reject and revoke', () => {
    it('forwards the reason to reject', async () => {
      await controller.reject(requestId, { reason: 'not needed' }, req);
      expect(service.reject).toHaveBeenCalledWith(
        companyId,
        req.user,
        requestId,
        'not needed',
      );
    });

    it('forwards the reason to revoke', async () => {
      await controller.revoke(requestId, { reason: 'left team' }, req);
      expect(service.revoke).toHaveBeenCalledWith(
        companyId,
        req.user,
        requestId,
        'left team',
      );
    });
  });
  describe('HTTP validation', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ContactAccessRequestsController],
        providers: [
          { provide: ContactAccessRequestsService, useValue: service },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            context.switchToHttp().getRequest<{ user: unknown }>().user =
              req.user;
            return true;
          },
        })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('400s a reject without a reason', async () => {
      await request(app.getHttpServer())
        .post(`/contact-access-requests/${requestId}/reject`)
        .send({})
        .expect(400);
      expect(service.reject).not.toHaveBeenCalled();
    });

    it('400s an approve with a past expiresAt', async () => {
      await request(app.getHttpServer())
        .post(`/contact-access-requests/${requestId}/approve`)
        .send({ expiresAt: '2020-01-01T00:00:00Z' })
        .expect(400);
      expect(service.approve).not.toHaveBeenCalled();
    });

    it('400s a non-uuid id', async () => {
      await request(app.getHttpServer())
        .post('/contact-access-requests/not-a-uuid/revoke')
        .send({ reason: 'x' })
        .expect(400);
    });

    it('accepts the injected regionCode on the list query', async () => {
      await request(app.getHttpServer())
        .get('/contact-access-requests?mine=true&regionCode=dubai')
        .expect(200);
      expect(service.findAll).toHaveBeenCalledWith(
        companyId,
        req.user,
        expect.objectContaining({ mine: true }),
      );
    });

    it('returns 201 with the serialized row on create', async () => {
      const res = await request(app.getHttpServer())
        .post('/contact-access-requests')
        .send({ contactId })
        .expect(201);
      expect((res.body as { id: string }).id).toBe(requestId);
    });
  });
});
