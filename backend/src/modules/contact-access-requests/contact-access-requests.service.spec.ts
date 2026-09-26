import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  ContactAccessRequestsService,
  DEFAULT_GRANT_DAYS,
  resolveApprovalExpiry,
  serializeContactAccessRequest,
} from './contact-access-requests.service';
import {
  ContactAccessKind,
  ContactAccessRequest,
  ContactAccessSourceType,
  ContactAccessStatus,
} from './entities/contact-access-request.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { RedisService } from '../redis/redis.service';
import { Role } from '@shared/enums/roles.enum';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';

function qbMock(result: {
  getRawMany?: unknown[];
  getManyAndCount?: [unknown[], number];
  getOne?: unknown;
}) {
  const chain: Record<string, jest.Mock> = {};
  [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'leftJoin',
    'orderBy',
    'skip',
    'take',
  ].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.getRawMany = jest.fn().mockResolvedValue(result.getRawMany ?? []);
  chain.getManyAndCount = jest
    .fn()
    .mockResolvedValue(result.getManyAndCount ?? [[], 0]);
  chain.getOne = jest.fn().mockResolvedValue(result.getOne ?? null);
  return chain;
}

describe('ContactAccessRequestsService', () => {
  let service: ContactAccessRequestsService;
  let repo: { createQueryBuilder: jest.Mock };
  let contactRepo: { findOne: jest.Mock };
  let manager: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let dataSource: { transaction: jest.Mock; manager: typeof manager };
  let recordHistory: { record: jest.Mock; resolveActorName: jest.Mock };
  let notifications: {
    notifyContactAccessRequested: jest.Mock;
    notifyContactAccessDecided: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let redis: { get: jest.Mock; incr: jest.Mock; expire: jest.Mock };

  const companyId = 'company-1';
  const contactId = 'contact-1';
  const agentId = 'agent-1';
  const managerId = 'manager-1';
  const source = {
    sourceType: ContactAccessSourceType.LEAD,
    sourceId: 'lead-1',
  };

  const contact = {
    id: contactId,
    companyId,
    firstName: 'Test',
    lastName: 'Client',
    phone: '+971501234567',
    regionCode: 'dubai',
  } as Contact;

  const user = (role: Role, regionCodes: string[] = ['dubai']) =>
    ({
      userId: `${role}-user`,
      email: 'user@example.com',
      companyId,
      role,
      regionCodes,
    }) as JwtUserPayload;

  const pendingRow = (): ContactAccessRequest =>
    ({
      id: 'req-1',
      companyId,
      contactId,
      requesterId: agentId,
      regionCode: 'dubai',
      kind: ContactAccessKind.REQUEST,
      status: ContactAccessStatus.PENDING,
      sourceType: null,
      sourceId: null,
      note: null,
      decidedBy: null,
      decidedAt: null,
      expiresAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    }) as ContactAccessRequest;

  // Routes manager.findOne by entity: Contact, active grant (where array), pending, decision load.
  const routeFindOne = (opts: {
    contact?: Contact | null;
    active?: ContactAccessRequest | null;
    pending?: ContactAccessRequest | null;
    byId?: ContactAccessRequest | null;
  }) => {
    manager.findOne.mockImplementation(
      (entity: unknown, options: { where: unknown }) => {
        if (entity === Contact) {
          return Promise.resolve(
            opts.contact === undefined ? contact : opts.contact,
          );
        }
        if (Array.isArray(options.where)) {
          return Promise.resolve(opts.active ?? null);
        }
        const where = options.where as { status?: string; id?: string };
        if (where.id) return Promise.resolve(opts.byId ?? null);
        return Promise.resolve(opts.pending ?? null);
      },
    );
  };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      save: jest.fn((_entity: unknown, row: object) =>
        Promise.resolve({ id: 'saved-1', ...row }),
      ),
      create: jest.fn((_entity: unknown, row: object) => ({ ...row })),
    };
    dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      manager,
    };
    recordHistory = {
      record: jest.fn().mockResolvedValue(undefined),
      resolveActorName: jest.fn().mockResolvedValue('Test User'),
    };
    notifications = {
      notifyContactAccessRequested: jest.fn().mockResolvedValue(2),
      notifyContactAccessDecided: jest.fn().mockResolvedValue({}),
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    repo = { createQueryBuilder: jest.fn() };
    contactRepo = { findOne: jest.fn().mockResolvedValue(contact) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactAccessRequestsService,
        { provide: getRepositoryToken(ContactAccessRequest), useValue: repo },
        { provide: getRepositoryToken(Contact), useValue: contactRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: RecordHistoryService, useValue: recordHistory },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
        { provide: RedisService, useValue: { client: redis } },
      ],
    }).compile();

    service = module.get(ContactAccessRequestsService);
  });

  describe('grantedContactIds', () => {
    it('returns an empty set without querying for empty input', async () => {
      const result = await service.grantedContactIds(companyId, agentId, []);
      expect(result.size).toBe(0);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('runs one query scoped to company, requester, approved and unexpired', async () => {
      const qb = qbMock({ getRawMany: [{ contactId: 'c1' }] });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.grantedContactIds(companyId, agentId, [
        'c1',
        'c2',
        'c1',
      ]);

      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(qb.where).toHaveBeenCalledWith('r.companyId = :companyId', {
        companyId,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('r.requesterId = :userId', {
        userId: agentId,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('r.contactId IN (:...ids)', {
        ids: ['c1', 'c2'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('r.status = :status', {
        status: ContactAccessStatus.APPROVED,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(r.expiresAt IS NULL OR r.expiresAt > now())',
      );
      expect([...result]).toEqual(['c1']);
    });
  });

  describe('grantLink', () => {
    it('does nothing when an approval without expiry exists', async () => {
      routeFindOne({
        active: { id: 'existing', expiresAt: null } as ContactAccessRequest,
      });

      await service.grantLink(companyId, contactId, agentId, managerId, source);

      expect(manager.save).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('removes the expiry of a dated approval instead of inserting', async () => {
      routeFindOne({
        active: {
          id: 'existing',
          expiresAt: new Date(Date.now() + 1000),
        } as ContactAccessRequest,
      });

      await service.grantLink(companyId, contactId, agentId, managerId, source);

      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          id: 'existing',
          expiresAt: null,
          decidedBy: managerId,
        }),
      );
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('approves a pending row instead of inserting', async () => {
      const pending = pendingRow();
      routeFindOne({ pending });

      await service.grantLink(companyId, contactId, agentId, managerId, source);

      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          id: 'req-1',
          status: ContactAccessStatus.APPROVED,
          decidedBy: managerId,
          expiresAt: null,
        }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.ACCESS_GRANTED,
          entityType: 'Contact',
          entityTitle: 'Test Client',
          regionCode: 'dubai',
        }),
      );
      expect(notifications.notifyContactAccessDecided).not.toHaveBeenCalled();
    });

    it('inserts an APPROVED LINK row with the contact region', async () => {
      routeFindOne({});

      await service.grantLink(companyId, contactId, agentId, managerId, source);

      expect(manager.create).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          companyId,
          contactId,
          requesterId: agentId,
          regionCode: 'dubai',
          kind: ContactAccessKind.LINK,
          status: ContactAccessStatus.APPROVED,
          decidedBy: managerId,
          expiresAt: null,
          sourceType: 'lead',
          sourceId: 'lead-1',
        }),
      );
      expect(notifications.notifyContactAccessRequested).not.toHaveBeenCalled();
    });

    it('rejects a contact outside the company with 400', async () => {
      routeFindOne({ contact: null });

      await expect(
        service.grantLink(companyId, contactId, agentId, managerId, source),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyPhone', () => {
    it('inserts a VERIFIED row on a last-9-digit match', async () => {
      routeFindOne({});

      const ok = await service.verifyPhone(
        companyId,
        contactId,
        agentId,
        '050 123 4567',
        source,
      );

      expect(ok).toBe(true);
      expect(contactRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: contactId, companyId } }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          kind: ContactAccessKind.VERIFIED,
          decidedBy: agentId,
          status: ContactAccessStatus.APPROVED,
        }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ reason: 'Phone verified' }),
      );
      expect(redis.incr).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('counts and audits a miss without leaking either phone', async () => {
      redis.incr.mockResolvedValue(1);

      const ok = await service.verifyPhone(
        companyId,
        contactId,
        agentId,
        '+971509999999',
        source,
      );

      expect(ok).toBe(false);
      const key = `contact-access:verify:${companyId}:${agentId}:${contactId}`;
      expect(redis.incr).toHaveBeenCalledWith(key);
      expect(redis.expire).toHaveBeenCalledWith(key, 3600);
      expect(audit.log).toHaveBeenCalledWith({
        companyId,
        userId: agentId,
        action: AuditAction.ACCESS_VERIFY_FAILED,
        entityType: 'Contact',
        entityId: contactId,
        regionCode: 'dubai',
        newValue: { attempt: 1 },
      });
      const logged = JSON.stringify(audit.log.mock.calls);
      expect(logged).not.toContain('509999999');
      expect(logged).not.toContain('501234567');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('does not reset the TTL after the first miss', async () => {
      redis.get.mockResolvedValue('2');
      redis.incr.mockResolvedValue(3);

      await service.verifyPhone(companyId, contactId, agentId, '1', source);

      expect(redis.expire).not.toHaveBeenCalled();
    });

    it('throws 429 on the sixth miss in the hour', async () => {
      redis.get.mockResolvedValue('5');

      const err = await service
        .verifyPhone(companyId, contactId, agentId, '+971501234567', source)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).message).toBe(
        'Too many attempts, try again later',
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('throws 429 when a concurrent miss pushes the count past five', async () => {
      redis.get.mockResolvedValue('4');
      redis.incr.mockResolvedValue(6);

      await expect(
        service.verifyPhone(companyId, contactId, agentId, '1', source),
      ).rejects.toMatchObject({ status: 429 });
      expect(audit.log).toHaveBeenCalled();
    });

    it('404s for a contact outside the company', async () => {
      contactRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyPhone(companyId, contactId, agentId, '1', source),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('raiseRequest', () => {
    it('returns an unexpired approval unchanged', async () => {
      const active = { id: 'grant-1' } as ContactAccessRequest;
      routeFindOne({ active });

      const result = await service.raiseRequest(
        companyId,
        contactId,
        agentId,
        null,
      );

      expect(result).toBe(active);
      expect(manager.save).not.toHaveBeenCalled();
      expect(notifications.notifyContactAccessRequested).not.toHaveBeenCalled();
    });

    it('returns an existing pending row unchanged', async () => {
      const pending = pendingRow();
      routeFindOne({ pending });

      const result = await service.raiseRequest(
        companyId,
        contactId,
        agentId,
        null,
      );

      expect(result).toBe(pending);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('inserts a PENDING REQUEST, records history and notifies approvers', async () => {
      routeFindOne({});

      const result = await service.raiseRequest(
        companyId,
        contactId,
        agentId,
        source,
        '  need it  ',
      );

      expect(manager.create).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          kind: ContactAccessKind.REQUEST,
          status: ContactAccessStatus.PENDING,
          regionCode: 'dubai',
          note: 'need it',
          sourceType: 'lead',
          sourceId: 'lead-1',
        }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.ACCESS_REQUESTED,
          actorId: agentId,
        }),
      );
      expect(notifications.notifyContactAccessRequested).toHaveBeenCalledWith({
        companyId,
        requestId: result.id,
        requesterId: agentId,
        requesterName: 'Test User',
        contactName: 'Test Client',
        regionCode: 'dubai',
      });
    });

    it('never falls back to the phone in the contact name', async () => {
      routeFindOne({
        contact: { ...contact, firstName: null, lastName: null } as Contact,
      });

      await service.raiseRequest(companyId, contactId, agentId, null);

      expect(
        notifications.notifyContactAccessRequested.mock.calls[0][0].contactName,
      ).toBe('Unnamed contact');
    });

    it('keeps the request when the notification fan-out fails', async () => {
      routeFindOne({});
      notifications.notifyContactAccessRequested.mockRejectedValue(
        new Error('down'),
      );

      await expect(
        service.raiseRequest(companyId, contactId, agentId, null),
      ).resolves.toMatchObject({ status: ContactAccessStatus.PENDING });
    });

    it('returns the winning row when a concurrent insert hits the pending index', async () => {
      const winner = pendingRow();
      dataSource.transaction.mockRejectedValueOnce(
        Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), {
          driverError: { code: '23505' },
        }),
      );
      routeFindOne({ pending: winner });

      await expect(
        service.raiseRequest(companyId, contactId, agentId, null),
      ).resolves.toBe(winner);
    });
  });

  describe('approve', () => {
    it('403s a MANAGER outside the row region', async () => {
      routeFindOne({ byId: pendingRow() });

      await expect(
        service.approve(
          companyId,
          user(Role.MANAGER, ['abudhabi']),
          'req-1',
          null,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('403s an AGENT even in region', async () => {
      routeFindOne({ byId: pendingRow() });

      await expect(
        service.approve(companyId, user(Role.AGENT), 'req-1', null),
      ).rejects.toThrow(ForbiddenException);
    });

    it('409s when the row is not PENDING', async () => {
      routeFindOne({
        byId: { ...pendingRow(), status: ContactAccessStatus.REJECTED },
      });

      await expect(
        service.approve(companyId, user(Role.MANAGER), 'req-1', null),
      ).rejects.toThrow(ConflictException);
    });

    it('404s for a row outside the company', async () => {
      routeFindOne({ byId: null });

      await expect(
        service.approve(companyId, user(Role.COMPANY_ADMIN), 'req-1', null),
      ).rejects.toThrow(NotFoundException);
      expect(manager.findOne).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({ where: { id: 'req-1', companyId } }),
      );
    });

    it('approves in region, records history, notifies and returns the view row', async () => {
      const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      routeFindOne({ byId: pendingRow() });
      const view = { ...pendingRow(), status: ContactAccessStatus.APPROVED };
      repo.createQueryBuilder.mockReturnValue(qbMock({ getOne: view }));
      const approver = user(Role.MANAGER);

      const result = await service.approve(
        companyId,
        approver,
        'req-1',
        expiresAt,
      );

      expect(manager.save).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          status: ContactAccessStatus.APPROVED,
          decidedBy: approver.userId,
          expiresAt,
        }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.ACCESS_GRANTED,
          actorId: approver.userId,
        }),
      );
      expect(notifications.notifyContactAccessDecided).toHaveBeenCalledWith(
        expect.objectContaining({
          requesterId: agentId,
          decision: 'approved',
        }),
      );
      expect(result).toBe(view);
    });

    it('lets COMPANY_ADMIN approve any region with no expiry', async () => {
      routeFindOne({ byId: { ...pendingRow(), regionCode: 'riyadh' } });
      repo.createQueryBuilder.mockReturnValue(qbMock({ getOne: pendingRow() }));

      await service.approve(
        companyId,
        user(Role.COMPANY_ADMIN, []),
        'req-1',
        null,
      );

      expect(manager.save).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({ expiresAt: null }),
      );
    });

    it('rejects a past expiry', async () => {
      await expect(
        service.approve(
          companyId,
          user(Role.MANAGER),
          'req-1',
          new Date(Date.now() - 1000),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveApprovalExpiry', () => {
    const now = new Date('2026-09-26T00:00:00Z');

    it('defaults to 90 days', () => {
      expect(resolveApprovalExpiry({}, now)).toEqual(
        new Date(now.getTime() + DEFAULT_GRANT_DAYS * 24 * 60 * 60 * 1000),
      );
      expect(DEFAULT_GRANT_DAYS).toBe(90);
    });

    it('returns null for forever', () => {
      expect(resolveApprovalExpiry({ forever: true }, now)).toBeNull();
    });

    it('accepts a future date and rejects a past one', () => {
      expect(
        resolveApprovalExpiry({ expiresAt: '2026-12-01T00:00:00Z' }, now),
      ).toEqual(new Date('2026-12-01T00:00:00Z'));
      expect(() =>
        resolveApprovalExpiry({ expiresAt: '2026-01-01T00:00:00Z' }, now),
      ).toThrow(BadRequestException);
    });

    it('rejects both forever and a date', () => {
      expect(() =>
        resolveApprovalExpiry(
          { forever: true, expiresAt: '2026-12-01T00:00:00Z' },
          now,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('reject and revoke', () => {
    beforeEach(() => {
      repo.createQueryBuilder.mockReturnValue(qbMock({ getOne: pendingRow() }));
    });

    it('rejects a pending row with the reason as note', async () => {
      routeFindOne({ byId: pendingRow() });

      await service.reject(
        companyId,
        user(Role.ADMIN),
        'req-1',
        ' not needed ',
      );

      expect(manager.save).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          status: ContactAccessStatus.REJECTED,
          note: 'not needed',
        }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.ACCESS_REJECTED,
          reason: 'not needed',
        }),
      );
      expect(notifications.notifyContactAccessDecided).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'rejected', reason: 'not needed' }),
      );
    });

    it('requires a reason', async () => {
      await expect(
        service.reject(companyId, user(Role.ADMIN), 'req-1', '  '),
      ).rejects.toThrow(BadRequestException);
    });

    it('409s rejecting an approved row', async () => {
      routeFindOne({
        byId: { ...pendingRow(), status: ContactAccessStatus.APPROVED },
      });

      await expect(
        service.reject(companyId, user(Role.ADMIN), 'req-1', 'x'),
      ).rejects.toThrow(ConflictException);
    });

    it('revokes an approved LINK row', async () => {
      routeFindOne({
        byId: {
          ...pendingRow(),
          kind: ContactAccessKind.LINK,
          status: ContactAccessStatus.APPROVED,
        },
      });

      await service.revoke(companyId, user(Role.MANAGER), 'req-1', 'left team');

      expect(manager.save).toHaveBeenCalledWith(
        ContactAccessRequest,
        expect.objectContaining({
          status: ContactAccessStatus.REVOKED,
          note: 'left team',
        }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ action: RecordHistoryAction.ACCESS_REVOKED }),
      );
      expect(notifications.notifyContactAccessDecided).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'revoked' }),
      );
    });

    it('409s revoking a pending row', async () => {
      routeFindOne({ byId: pendingRow() });

      await expect(
        service.revoke(companyId, user(Role.MANAGER), 'req-1', 'x'),
      ).rejects.toThrow(ConflictException);
    });

    it('403s an ADMIN revoking outside their regions', async () => {
      routeFindOne({
        byId: { ...pendingRow(), status: ContactAccessStatus.APPROVED },
      });

      await expect(
        service.revoke(companyId, user(Role.ADMIN, ['sharjah']), 'req-1', 'x'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    let qb: ReturnType<typeof qbMock>;

    beforeEach(() => {
      qb = qbMock({ getManyAndCount: [[pendingRow()], 1] });
      repo.createQueryBuilder.mockReturnValue(qb);
    });

    const whereClauses = () =>
      qb.andWhere.mock.calls.map((call: unknown[]) => call[0] as string);

    it('COMPANY_ADMIN sees the whole company, kind defaults to REQUEST', async () => {
      const result = await service.findAll(
        companyId,
        user(Role.COMPANY_ADMIN),
        {},
      );

      expect(qb.where).toHaveBeenCalledWith('r.companyId = :companyId', {
        companyId,
      });
      expect(whereClauses()).not.toContain('r.requesterId = :requesterId');
      expect(whereClauses()).not.toContain('r.regionCode IN (:...regionCodes)');
      expect(qb.andWhere).toHaveBeenCalledWith('r.kind = :kind', {
        kind: ContactAccessKind.REQUEST,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('r.createdAt', 'DESC');
      expect(result).toEqual({
        data: [pendingRow()],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('MANAGER and ADMIN see their regions only', async () => {
      await service.findAll(
        companyId,
        user(Role.MANAGER, ['dubai', 'sharjah']),
        {
          status: ContactAccessStatus.PENDING,
        },
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        'r.regionCode IN (:...regionCodes)',
        { regionCodes: ['dubai', 'sharjah'] },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('r.status = :status', {
        status: ContactAccessStatus.PENDING,
      });
    });

    it('an ADMIN with no regions sees nothing', async () => {
      await service.findAll(companyId, user(Role.ADMIN, []), {});

      expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
    });

    it.each([Role.AGENT, Role.ACCOUNTANT])(
      '%s sees only own requests',
      async (role) => {
        const caller = user(role);
        await service.findAll(companyId, caller, {});

        expect(qb.andWhere).toHaveBeenCalledWith(
          'r.requesterId = :requesterId',
          {
            requesterId: caller.userId,
          },
        );
        expect(whereClauses()).not.toContain(
          'r.regionCode IN (:...regionCodes)',
        );
      },
    );

    it('mine forces requester = self for an approver', async () => {
      const caller = user(Role.COMPANY_ADMIN);
      await service.findAll(companyId, caller, {
        mine: true,
        kind: ContactAccessKind.LINK,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('r.requesterId = :requesterId', {
        requesterId: caller.userId,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('r.kind = :kind', {
        kind: ContactAccessKind.LINK,
      });
    });

    it('clamps pagination with the shared helpers', async () => {
      const result = await service.findAll(
        companyId,
        user(Role.COMPANY_ADMIN),
        {
          page: 3,
          limit: 10,
        },
      );

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it('selects only name columns from the contact join', async () => {
      await service.findAll(companyId, user(Role.COMPANY_ADMIN), {});

      const selected = JSON.stringify(qb.addSelect.mock.calls);
      expect(selected).not.toMatch(/phone|email'|nationalId/);
      expect(qb.addSelect).toHaveBeenCalledWith([
        'c.id',
        'c.firstName',
        'c.lastName',
        'c.regionCode',
      ]);
    });
  });

  describe('serializeContactAccessRequest', () => {
    it('shapes the row and never exposes contact phone, email or user secrets', () => {
      const row = {
        ...pendingRow(),
        decidedBy: 'manager-1',
        contact: {
          ...contact,
          email: 'client@example.com',
          nationalId: '784-0000',
        },
        requester: {
          id: agentId,
          name: '',
          email: 'agent@example.com',
          password: 'hash',
        },
        decider: {
          id: 'manager-1',
          name: 'Test Manager',
          email: 'm@example.com',
        },
      } as unknown as ContactAccessRequest;

      const view = serializeContactAccessRequest(row);

      expect(view).toEqual({
        id: 'req-1',
        kind: ContactAccessKind.REQUEST,
        status: ContactAccessStatus.PENDING,
        contact: {
          id: contactId,
          displayName: 'Test Client',
          regionCode: 'dubai',
        },
        requester: { id: agentId, name: 'agent@example.com' },
        decidedBy: { id: 'manager-1', name: 'Test Manager' },
        regionCode: 'dubai',
        sourceType: null,
        sourceId: null,
        note: null,
        decidedAt: null,
        expiresAt: null,
        createdAt: row.createdAt,
      });
      const json = JSON.stringify(view);
      expect(json).not.toContain('501234567');
      expect(json).not.toContain('client@example.com');
      expect(json).not.toContain('784-0000');
      expect(json).not.toContain('hash');
    });
  });
});
