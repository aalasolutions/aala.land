import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@shared/enums/roles.enum';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  Repository,
  WhereExpressionBuilder,
} from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import {
  ContactPrivacyService,
  FullContactView,
  LimitedContactView,
} from './contact-privacy.service';
import { User } from '../users/entities/user.entity';
import { ContactAccessRequest } from '../contact-access-requests/entities/contact-access-request.entity';
import { ContactAccessRequestsService } from '../contact-access-requests/contact-access-requests.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { Contact } from './entities/contact.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WhatsappChat } from '../whatsapp/entities/whatsapp-chat.entity';
import { Company } from '../companies/entities/company.entity';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';

// A query-builder mock that records the chained fluent calls and resolves from
// the given result. Used for findAll + the tag-derivation sub-queries.
function qbMock(result: {
  getMany?: unknown[];
  getManyAndCount?: [unknown[], number];
  getRawMany?: unknown[];
}) {
  const chain: Record<string, jest.Mock> = {};
  const mk = (key: string, returned?: unknown) => {
    chain[key] = jest.fn().mockReturnValue(returned ?? chain);
  };
  [
    'createQueryBuilder',
    'where',
    'andWhere',
    'skip',
    'take',
    'orderBy',
    'leftJoin',
    'leftJoinAndSelect',
    'select',
    'addSelect',
    'groupBy',
  ].forEach((m) => mk(m));
  chain.getManyAndCount = jest
    .fn()
    .mockResolvedValue(result.getManyAndCount ?? [[], 0]);
  chain.getMany = jest.fn().mockResolvedValue(result.getMany ?? []);
  chain.getRawMany = jest.fn().mockResolvedValue(result.getRawMany ?? []);
  return chain;
}

describe('ContactsService', () => {
  let service: ContactsService;
  let repo: jest.Mocked<Repository<Contact>>;
  let leadRepo: jest.Mocked<Repository<Lead>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let leaseRepo: jest.Mocked<Repository<Lease>>;
  let chatRepo: jest.Mocked<Repository<WhatsappChat>>;
  let companyRepo: jest.Mocked<Repository<Company>>;
  let dataSource: { transaction: jest.Mock };
  let userRepo: { find: jest.Mock };
  let accessRepo: { find: jest.Mock };
  let accessRequests: {
    grantedContactIds: jest.Mock;
    verifyPhone: jest.Mock;
  };
  let audit: { log: jest.Mock };

  const companyId = 'company-uuid-1';
  const adminCaller = { role: 'company_admin', regionCodes: ['dubai'] };
  const LIMITED_KEYS = [
    'accessLevel',
    'accessPending',
    'createdAt',
    'createdBy',
    'createdByName',
    'firstName',
    'id',
    'lastInitial',
    'phoneMasked',
    'regionCode',
  ];

  const mockContact = {
    id: 'contact-uuid-1',
    companyId,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'ahmed@example.com',
    phone: '+971501234567',
    isWhatsapp: false,
    nationality: null,
    nationalId: null,
    contactCompany: 'Emaar Properties',
    jobTitle: 'Property Manager',
    address: 'Business Bay, Dubai',
    notes: 'VIP client',
    regionCode: 'dubai',
    createdBy: 'user-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Contact;

  let recordHistory: { record: jest.Mock; resolveActorName: jest.Mock };
  const actorId = 'user-uuid-1';
  const deleteDto = { reason: 'Duplicate' };

  beforeEach(async () => {
    recordHistory = {
      record: jest.fn().mockResolvedValue(undefined),
      resolveActorName: jest.fn().mockResolvedValue('Admin User'),
    };
    userRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'user-uuid-1', name: 'Test User', email: 'user@example.com' },
        ]),
    };
    accessRepo = { find: jest.fn().mockResolvedValue([]) };
    accessRequests = {
      grantedContactIds: jest.fn().mockResolvedValue(new Set()),
      verifyPhone: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Lead),
          useValue: { count: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: { count: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: { count: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(WhatsappChat),
          useValue: {
            count: jest.fn(),
            query: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              defaultRegionCode: 'dubai',
              activeRegions: ['dubai', 'makkah', 'punjab'],
            }),
          },
        },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: RecordHistoryService, useValue: recordHistory },
        ContactPrivacyService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        {
          provide: getRepositoryToken(ContactAccessRequest),
          useValue: accessRepo,
        },
        { provide: ContactAccessRequestsService, useValue: accessRequests },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    repo = module.get(getRepositoryToken(Contact));
    leadRepo = module.get(getRepositoryToken(Lead));
    unitRepo = module.get(getRepositoryToken(Unit));
    leaseRepo = module.get(getRepositoryToken(Lease));
    chatRepo = module.get(getRepositoryToken(WhatsappChat));
    companyRepo = module.get(getRepositoryToken(Company));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    function stubReload() {
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValue(mockContact);
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
    }

    it('creates and returns a contact with createdBy', async () => {
      const dto = { firstName: 'Ahmed', phone: '+971501234567' };
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      stubReload();

      const result = await service.create(
        companyId,
        dto as any,
        'user-uuid-1',
        adminCaller,
      );

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        createdBy: 'user-uuid-1',
        regionCode: 'dubai',
      });
      expect(result).toEqual({
        ...mockContact,
        tags: [],
        displayName: 'Ahmed Al-Rashid',
        accessLevel: 'FULL',
        createdByName: 'Test User',
      });
    });

    it('re-links whatsapp chats for the new number (clears the resolution latch)', async () => {
      const dto = { firstName: 'Stranger', phone: '+971501234567' };
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      stubReload();

      await service.create(companyId, dto as any, 'user-uuid-1', adminCaller);

      // linkMatchingChats runs an UPDATE that sets contact_id + clears the
      // attempted latch on matching chats, so a stranger chat links once the
      // person is saved rather than staying permanently unlinked.
      expect(chatRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('"contact_resolution_attempted" = false'),
        [mockContact.id, companyId, '501234567'],
      );
    });
  });

  describe('resolveOrCreate', () => {
    it('returns an existing contact when contactId is given', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, {
        contactId: 'contact-uuid-1',
      });
      expect(result).toEqual({ contact: mockContact, existing: true });
    });

    it('resolves by phone suffix when the number is already a contact', async () => {
      repo.find.mockResolvedValue([mockContact]);
      repo.findOne.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, {
        firstName: 'Ahmed',
        phone: '+971501234567',
      });
      expect(result.contact.id).toBe('contact-uuid-1');
      expect(result.existing).toBe(true);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates a new contact when no phone matches', async () => {
      repo.find.mockResolvedValue([]);
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, {
        firstName: 'New',
        phone: '+971555000111',
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ contact: mockContact, existing: false });
    });

    it('creates when neither phone nor email is present', async () => {
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, {
        firstName: 'Anon',
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ contact: mockContact, existing: false });
    });
  });

  describe('findOne', () => {
    it('returns a serialized contact with derived tags', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [{ id: mockContact.id }] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );

      const result = (await service.findOne('contact-uuid-1', companyId, {
        userId: 'user-uuid-1',
        ...adminCaller,
      })) as FullContactView;

      expect(result.accessLevel).toBe('FULL');
      expect(result.tags).toContain('lead');
      expect(result.displayName).toBe('Ahmed Al-Rashid');
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll region confinement', () => {
    function arrangeList() {
      const qb = qbMock({ getManyAndCount: [[], 0] });
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      return qb;
    }

    it('confines a scoped caller to their assigned regions', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, undefined, undefined, undefined, {
        userId: 'agent-uuid-1',
        role: Role.AGENT,
        regionCodes: ['makkah', 'punjab'],
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.region_code IN (:...regionCodes)',
        { regionCodes: ['makkah', 'punjab'] },
      );
    });

    it('narrows the assigned set to the region asked for', async () => {
      const qb = arrangeList();

      await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        { regionCode: 'makkah' },
        {
          userId: 'agent-uuid-1',
          role: Role.AGENT,
          regionCodes: ['makkah', 'punjab'],
        },
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.region_code IN (:...regionCodes)',
        { regionCodes: ['makkah'] },
      );
    });

    it('returns nothing when the caller asks for a region they do not hold', async () => {
      arrangeList();

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        { regionCode: 'punjab' },
        { userId: 'agent-uuid-1', role: Role.AGENT, regionCodes: ['makkah'] },
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns nothing when the caller has no assigned region', async () => {
      arrangeList();

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        { userId: 'agent-uuid-1', role: Role.AGENT, regionCodes: [] },
      );

      expect(result.data).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('leaves an admin unconfined', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, undefined, undefined, undefined, {
        userId: 'admin-uuid-1',
        role: Role.COMPANY_ADMIN,
        regionCodes: [],
      });

      const regionCalls = (qb.andWhere as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes('region_code'),
      );
      expect(regionCalls).toHaveLength(0);
    });

    const regionClauses = (qb: Record<string, jest.Mock>) =>
      qb.andWhere.mock.calls.filter((c) =>
        String(c[0]).includes('region_code'),
      );

    it('searches the whole company and ignores the regionCode the client sent', async () => {
      const qb = arrangeList();

      await service.findAll(
        companyId,
        1,
        20,
        'Ahmed',
        undefined,
        { regionCode: 'makkah' },
        { userId: 'agent-uuid-1', role: Role.AGENT, regionCodes: ['makkah'] },
      );

      expect(regionClauses(qb)).toHaveLength(0);
      expect(repo.createQueryBuilder).toHaveBeenCalled();
    });

    it('lists every region when allRegions is set, even for a caller with no region', async () => {
      const qb = arrangeList();

      await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        { regionCode: 'makkah', allRegions: true },
        { userId: 'agent-uuid-1', role: Role.AGENT, regionCodes: [] },
      );

      expect(regionClauses(qb)).toHaveLength(0);
    });

    function searchWhere(qb: ReturnType<typeof qbMock>) {
      const bracket = (qb.andWhere as jest.Mock).mock.calls
        .map((call: unknown[]) => call[0])
        .find((arg) => arg instanceof Brackets) as Brackets;
      const where = jest.fn().mockReturnThis();
      const orWhere = jest.fn().mockReturnThis();
      bracket.whereFactory({
        where,
        orWhere,
      } as unknown as WhereExpressionBuilder);
      return { where, orWhere };
    }

    it('matches a phone term on the whole subscriber number, never a substring', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, '+971 50 123 4567');

      const { where, orWhere } = searchWhere(qb);
      expect(where).toHaveBeenCalledWith(
        expect.stringContaining('RIGHT(regexp_replace(c.phone'),
        { phoneDigits: '501234567' },
      );
      expect(orWhere).not.toHaveBeenCalled();
    });

    it('matches an email term exactly, case-insensitively', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, 'Ali@Example.com');

      const { where, orWhere } = searchWhere(qb);
      expect(where).toHaveBeenCalledWith('LOWER(c.email) = :emailExact', {
        emailExact: 'ali@example.com',
      });
      expect(orWhere).not.toHaveBeenCalled();
    });

    it('matches a name term on first and last name by substring only', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, 'Ahm');

      const { where, orWhere } = searchWhere(qb);
      expect(where).toHaveBeenCalledWith('c.first_name ILIKE :s', {
        s: '%Ahm%',
      });
      expect(orWhere).toHaveBeenCalledWith('c.last_name ILIKE :s');
    });

    it('keeps the region clause for a blank search', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, '   ', undefined, undefined, {
        userId: 'agent-uuid-1',
        role: Role.AGENT,
        regionCodes: ['makkah'],
      });

      expect(regionClauses(qb)).toHaveLength(1);
    });

    it('caps a page at 100 rows and reports the applied limit', async () => {
      const qb = arrangeList();

      const result = await service.findAll(companyId, 2, 500);

      expect(qb.take).toHaveBeenCalledWith(100);
      expect(qb.skip).toHaveBeenCalledWith(100);
      expect(result.limit).toBe(100);
    });
  });

  describe('findAll', () => {
    function stubQueryBuilders() {
      const qb = qbMock({ getManyAndCount: [[mockContact], 1] });
      repo.createQueryBuilder.mockReturnValue(qb as any);
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      return qb;
    }

    it('filters by agentId via an EXISTS clause covering both lead assignment and unit ownership', async () => {
      const qb = stubQueryBuilders();

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        agentId: 'agent-uuid-1',
      });

      const agentClause = qb.andWhere.mock.calls.find(
        ([, params]: [string, Record<string, unknown>]) =>
          params?.agentId === 'agent-uuid-1',
      );
      expect(agentClause).toBeDefined();
      const [sql] = agentClause;
      expect(sql).toContain('FROM leads l');
      expect(sql).toContain('l.assigned_to = :agentId');
      expect(sql).toContain('FROM units u');
      expect(sql).toContain('u.assigned_agent_id = :agentId');
      expect(sql).toContain('u.deleted_at IS NULL');
    });

    it('ignores archived units and leases when deriving tags', async () => {
      const qb = stubQueryBuilders();
      const leaseQb = qbMock({ getRawMany: [] });
      const unitQb = qbMock({ getRawMany: [] });
      leaseRepo.createQueryBuilder.mockReturnValue(leaseQb as any);
      unitRepo.createQueryBuilder.mockReturnValue(unitQb as any);

      await service.findAll(companyId, 1, 20, undefined, 'owner');

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('u.deleted_at IS NULL'),
      );
      expect(leaseQb.andWhere).toHaveBeenCalledWith('le.deleted_at IS NULL');
      expect(unitQb.andWhere).toHaveBeenCalledWith('u.deleted_at IS NULL');
    });

    it('filters by isWhatsapp', async () => {
      const qb = stubQueryBuilders();

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        isWhatsapp: true,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('c.is_whatsapp = :isWhatsapp', {
        isWhatsapp: true,
      });
    });

    it('filters isWhatsapp false explicitly (not skipped as falsy)', async () => {
      const qb = stubQueryBuilders();

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        isWhatsapp: false,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('c.is_whatsapp = :isWhatsapp', {
        isWhatsapp: false,
      });
    });

    it('includes a contact created exactly on dateTo (exclusive next-day boundary)', async () => {
      const qb = stubQueryBuilders();

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        dateTo: '2026-08-15',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        "c.created_at < :dateTo::date + interval '1 day'",
        { dateTo: '2026-08-15' },
      );
    });
  });

  describe('remove', () => {
    it('throws NotFound when the contact does not exist (no silent success)', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.remove('missing-id', companyId, deleteDto, actorId),
      ).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('deletes with a history row in one transaction when the contact has no edges', async () => {
      repo.findOne.mockResolvedValue({
        ...mockContact,
        regionCode: 'dubai',
      } as Contact);
      leadRepo.count.mockResolvedValue(0);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);
      const manager = { delete: jest.fn() };
      dataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => Promise<void>) =>
          cb(manager as unknown as EntityManager),
      );

      await service.remove('contact-uuid-1', companyId, deleteDto, actorId);

      expect(recordHistory.record).toHaveBeenCalledWith(manager, {
        companyId,
        action: RecordHistoryAction.DELETE,
        entityType: 'Contact',
        entityId: 'contact-uuid-1',
        entityTitle: 'Ahmed Al-Rashid',
        contextTitle: null,
        reason: 'Duplicate',
        actorId,
        actorName: 'Admin User',
        regionCode: 'dubai',
        metadata: {
          transferToContactId: null,
          movedCounts: { leads: 0, units: 0, leases: 0, chats: 0 },
        },
      });
      expect(manager.delete).toHaveBeenCalledWith(Contact, {
        id: 'contact-uuid-1',
        companyId,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('refuses transferring a contact to itself', async () => {
      await expect(
        service.remove(
          'contact-uuid-1',
          companyId,
          {
            ...deleteDto,
            transferToContactId: 'contact-uuid-1',
          },
          actorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a transfer target when the contact has edges', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.count.mockResolvedValue(2);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);

      await expect(
        service.remove('contact-uuid-1', companyId, deleteDto, actorId),
      ).rejects.toThrow(BadRequestException);
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('transfers edges and deletes the source atomically when a target is given', async () => {
      const target = { ...mockContact, id: 'contact-uuid-2' } as Contact;
      repo.findOne.mockResolvedValue(mockContact); // load source via findOneEntity
      leadRepo.count.mockResolvedValue(1);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);
      const manager = {
        update: jest.fn(),
        delete: jest.fn(),
        findOne: jest.fn().mockResolvedValue(target), // load transfer target inside tx
      };
      dataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => Promise<void>) =>
          cb(manager as unknown as EntityManager),
      );

      await service.remove(
        'contact-uuid-1',
        companyId,
        { ...deleteDto, transferToContactId: 'contact-uuid-2' },
        actorId,
      );

      expect(manager.update).toHaveBeenCalledWith(
        Lead,
        { contactId: 'contact-uuid-1', companyId },
        { contactId: 'contact-uuid-2' },
      );
      // Leases before units, matching lease then unit locks elsewhere.
      expect(manager.update.mock.calls.map(([entity]) => entity)).toEqual([
        Lead,
        Lease,
        Unit,
        WhatsappChat,
      ]);
      expect(manager.delete).toHaveBeenCalledWith(Contact, {
        id: 'contact-uuid-1',
        companyId,
      });
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.DELETE,
          entityType: 'Contact',
          entityTitle: 'Ahmed Al-Rashid',
          reason: 'Duplicate',
          metadata: {
            transferToContactId: 'contact-uuid-2',
            movedCounts: { leads: 1, units: 0, leases: 0, chats: 0 },
          },
        }),
      );
    });

    it('looks the transfer target up company-wide', async () => {
      const target = { ...mockContact, id: 'contact-uuid-2' } as Contact;
      repo.findOne.mockResolvedValue({
        ...mockContact,
        regionCode: 'makkah',
      } as Contact);
      leadRepo.count.mockResolvedValue(1);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);
      const manager = {
        update: jest.fn(),
        delete: jest.fn(),
        findOne: jest.fn().mockResolvedValue(target),
      };
      dataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => Promise<void>) =>
          cb(manager as unknown as EntityManager),
      );

      await service.remove(
        'contact-uuid-1',
        companyId,
        { ...deleteDto, transferToContactId: 'contact-uuid-2' },
        actorId,
        { role: Role.MANAGER, regionCodes: ['makkah'] },
      );

      expect(manager.findOne).toHaveBeenCalledWith(Contact, {
        where: { id: 'contact-uuid-2', companyId },
      });
    });

    it('writes no history when the transfer target is missing', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.count.mockResolvedValue(1);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);
      const manager = {
        update: jest.fn(),
        delete: jest.fn(),
        findOne: jest.fn().mockResolvedValue(null),
      };
      dataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => Promise<void>) =>
          cb(manager as unknown as EntityManager),
      );

      await expect(
        service.remove(
          'contact-uuid-1',
          companyId,
          { ...deleteDto, transferToContactId: 'contact-uuid-9' },
          actorId,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(recordHistory.record).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };

    function seedContactInRegion(regionCode: string) {
      const row = { ...mockContact, regionCode } as Contact;
      repo.findOne.mockImplementation((opts: any) => {
        const filter = opts?.where?.regionCode;
        if (filter && !(filter.value as string[]).includes(regionCode)) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      return row;
    }

    describe('by-id reads', () => {
      const makkahViewer = { userId: 'manager-uuid-1', ...makkahManager };

      it('finds a contact outside the caller regions but presents it LIMITED', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOne(
          'contact-uuid-1',
          companyId,
          makkahViewer,
        );

        expect(result.accessLevel).toBe('LIMITED');
        expect(Object.keys(result).sort()).toEqual(LIMITED_KEYS);
        expect(result).toMatchObject({
          firstName: 'Ahmed',
          lastInitial: 'A.',
          phoneMasked: '+971 50 *** **67',
          createdByName: 'Test User',
          accessPending: false,
        });
      });

      it('no longer gates findOneEntity on region', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOneEntity('contact-uuid-1', companyId);

        expect(result.id).toBe('contact-uuid-1');
        expect(repo.findOne).toHaveBeenCalledWith({
          where: { id: 'contact-uuid-1', companyId },
        });
      });

      it('still 404s a contact of another company', async () => {
        repo.findOne.mockResolvedValue(null);

        await expect(
          service.findOneEntity('contact-uuid-1', 'other-company'),
        ).rejects.toThrow(NotFoundException);
      });

      it('denies update on a contact outside the caller assigned regions', async () => {
        seedContactInRegion('punjab');

        await expect(
          service.update(
            'contact-uuid-1',
            companyId,
            { firstName: 'Khalid' },
            makkahViewer,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies remove on a contact outside the caller assigned regions', async () => {
        seedContactInRegion('punjab');

        await expect(
          service.remove(
            'contact-uuid-1',
            companyId,
            deleteDto,
            actorId,
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.delete).not.toHaveBeenCalled();
      });

      it('presents FULL in any region the caller is assigned to', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOne('contact-uuid-1', companyId, {
          userId: 'manager-uuid-1',
          ...twoRegionManager,
        });

        expect(result.accessLevel).toBe('FULL');
      });

      it('presents FULL to a company admin in every region', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOne('contact-uuid-1', companyId, {
          userId: 'admin-uuid-1',
          ...admin,
        });

        expect(result.accessLevel).toBe('FULL');
      });
    });

    describe('create with a body regionCode', () => {
      function stubNoDuplicate() {
        repo.findOne.mockResolvedValue(mockContact);
        leadRepo.createQueryBuilder.mockReturnValue(
          qbMock({ getRawMany: [] }) as any,
        );
        leaseRepo.createQueryBuilder.mockReturnValue(
          qbMock({ getRawMany: [] }) as any,
        );
        unitRepo.createQueryBuilder.mockReturnValue(
          qbMock({ getRawMany: [] }) as any,
        );
      }

      it('rejects a region outside the caller assigned set with 400', async () => {
        stubNoDuplicate();

        await expect(
          service.create(
            companyId,
            { firstName: 'Ahmed', regionCode: 'punjab' } as any,
            'user-uuid-1',
            makkahManager,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('rejects a region the company does not operate, even for an admin', async () => {
        stubNoDuplicate();

        await expect(
          service.create(
            companyId,
            { firstName: 'Ahmed', regionCode: 'atlantis' } as any,
            'user-uuid-1',
            admin,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('accepts a region inside the caller assigned set', async () => {
        stubNoDuplicate();
        repo.create.mockReturnValue(mockContact);
        repo.save.mockResolvedValue(mockContact);

        await service.create(
          companyId,
          { firstName: 'Ahmed', regionCode: 'makkah' } as any,
          'user-uuid-1',
          makkahManager,
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'makkah' }),
        );
      });

      it('falls back to the company default when the body omits a region', async () => {
        stubNoDuplicate();
        repo.create.mockReturnValue(mockContact);
        repo.save.mockResolvedValue(mockContact);

        await service.create(
          companyId,
          { firstName: 'Ahmed' } as any,
          'user-uuid-1',
          makkahManager,
        );

        expect(companyRepo.findOne).toHaveBeenCalled();
        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'dubai' }),
        );
      });
    });
  });

  describe('duplicates and merge', () => {
    const managerCaller = { role: Role.MANAGER, regionCodes: ['dubai'] };
    const agentCaller = { role: Role.AGENT, regionCodes: ['dubai'] };

    function stubTags() {
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
    }

    function stubMergeTransaction() {
      const manager = {
        save: jest.fn((_entity: unknown, row: Contact) => Promise.resolve(row)),
      };
      dataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => Promise<unknown>) =>
          cb(manager as unknown as EntityManager),
      );
      return manager;
    }

    it('answers an agent duplicate with 409 CONTACT_EXISTS and the LIMITED match', async () => {
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);

      const error: unknown = await service
        .create(
          companyId,
          { firstName: 'Someone', phone: '0501234567' } as any,
          'agent-uuid-1',
          agentCaller,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as {
        statusCode: number;
        code: string;
        message: string;
        contact: LimitedContactView;
      };
      expect(body).toMatchObject({
        statusCode: 409,
        code: 'CONTACT_EXISTS',
        message: 'Contact already added',
      });
      expect(body.contact.accessLevel).toBe('LIMITED');
      expect(Object.keys(body.contact).sort()).toEqual(LIMITED_KEYS);
      expect(repo.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('merges into the match for a manager and records the filled fields', async () => {
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);
      stubTags();
      const manager = stubMergeTransaction();

      await service.create(
        companyId,
        { phone: '+971501234567', nationality: 'Emirati' } as any,
        'manager-uuid-1',
        managerCaller,
      );

      expect(manager.save).toHaveBeenCalledWith(
        Contact,
        expect.objectContaining({ nationality: 'Emirati' }),
      );
      expect(recordHistory.record).toHaveBeenCalledWith(manager, {
        companyId,
        action: RecordHistoryAction.MERGE,
        entityType: 'Contact',
        entityId: 'contact-uuid-1',
        entityTitle: 'Ahmed Al-Rashid',
        actorId: 'manager-uuid-1',
        actorName: 'Admin User',
        regionCode: 'dubai',
        metadata: { filledFields: ['nationality'] },
      });
    });

    it('writes no MERGE history when the manager fills nothing', async () => {
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);
      stubTags();

      await service.create(
        companyId,
        { firstName: 'Other', phone: '+971501234567' } as any,
        'manager-uuid-1',
        managerCaller,
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('resolveOrCreate hands an agent the match untouched', async () => {
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);

      const result = await service.resolveOrCreate(
        companyId,
        { phone: '+971501234567', nationalId: 'x' } as any,
        'agent-uuid-1',
        undefined,
        Role.AGENT,
      );

      expect(result).toEqual({
        contact: expect.objectContaining({ id: 'contact-uuid-1' }),
        existing: true,
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('resolveOrCreate merges for a manager and records it', async () => {
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);
      const manager = stubMergeTransaction();

      const result = await service.resolveOrCreate(
        companyId,
        { phone: '+971501234567', isWhatsapp: true },
        'manager-uuid-1',
        undefined,
        Role.MANAGER,
      );

      expect(result.existing).toBe(true);
      expect(result.contact.isWhatsapp).toBe(true);
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.MERGE,
          metadata: { filledFields: ['isWhatsapp'] },
        }),
      );
    });
  });

  describe('update permissions', () => {
    const row = { ...mockContact, regionCode: 'dubai' } as Contact;

    function arrange() {
      repo.findOne.mockResolvedValue({ ...row } as Contact);
      repo.save.mockResolvedValue(row);
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
    }

    it.each([
      ['the creating agent', 'user-uuid-1', Role.AGENT, []],
      ['a manager in the contact region', 'm-1', Role.MANAGER, ['dubai']],
      ['an admin in the contact region', 'a-1', Role.ADMIN, ['dubai']],
      ['a company admin', 'ca-1', Role.COMPANY_ADMIN, []],
      ['a super admin', 'sa-1', Role.SUPER_ADMIN, []],
    ])('lets %s edit', async (_label, userId, role, regionCodes) => {
      arrange();

      await service.update(
        'contact-uuid-1',
        companyId,
        { notes: 'x' },
        { userId, role, regionCodes },
      );

      expect(repo.save).toHaveBeenCalled();
    });

    it.each([
      ['an agent who did not create it', 'agent-2', Role.AGENT, ['dubai']],
      ['a manager outside the region', 'm-2', Role.MANAGER, ['makkah']],
      ['an admin outside the region', 'a-2', Role.ADMIN, ['makkah']],
      ['an accountant in the region', 'acc-1', Role.ACCOUNTANT, ['dubai']],
    ])('forbids %s', async (_label, userId, role, regionCodes) => {
      arrange();

      await expect(
        service.update(
          'contact-uuid-1',
          companyId,
          { notes: 'x' },
          { userId, role, regionCodes },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('forbids an agent holding an approved grant', async () => {
      arrange();
      accessRequests.grantedContactIds.mockResolvedValue(
        new Set(['contact-uuid-1']),
      );

      await expect(
        service.update(
          'contact-uuid-1',
          companyId,
          { notes: 'x' },
          { userId: 'agent-2', role: Role.AGENT, regionCodes: ['dubai'] },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('VIEW audit', () => {
    function arrange(regionCode = 'dubai') {
      repo.findOne.mockResolvedValue({ ...mockContact, regionCode } as Contact);
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
    }

    it('logs every FULL view of a contact someone else created', async () => {
      arrange();
      const viewer = {
        userId: 'manager-uuid-1',
        role: Role.MANAGER,
        regionCodes: ['dubai'],
      };

      await service.findOne('contact-uuid-1', companyId, viewer);
      await service.findOne('contact-uuid-1', companyId, viewer);

      expect(audit.log).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith({
        companyId,
        userId: 'manager-uuid-1',
        action: AuditAction.VIEW,
        entityType: 'Contact',
        entityId: 'contact-uuid-1',
        regionCode: 'dubai',
      });
    });

    it('does not log the creator viewing their own contact', async () => {
      arrange();

      await service.findOne('contact-uuid-1', companyId, {
        userId: 'user-uuid-1',
        role: Role.AGENT,
        regionCodes: ['dubai'],
      });

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('does not log a LIMITED view', async () => {
      arrange('punjab');

      await service.findOne('contact-uuid-1', companyId, {
        userId: 'manager-uuid-1',
        role: Role.MANAGER,
        regionCodes: ['dubai'],
      });

      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('verifyPhone', () => {
    const agent = {
      userId: 'agent-uuid-1',
      role: Role.AGENT,
      regionCodes: ['dubai'],
    };

    beforeEach(() => {
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);
      leadRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      leaseRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
      unitRepo.createQueryBuilder.mockReturnValue(
        qbMock({ getRawMany: [] }) as any,
      );
    });

    it('passes the typed number with a contact source and reveals nothing on a miss', async () => {
      accessRequests.verifyPhone.mockResolvedValue(false);

      const result = await service.verifyPhone(
        'contact-uuid-1',
        companyId,
        '0500000000',
        agent,
      );

      expect(accessRequests.verifyPhone).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-1',
        'agent-uuid-1',
        '0500000000',
        { sourceType: 'contact', sourceId: 'contact-uuid-1' },
      );
      expect(result.verified).toBe(false);
      expect(result.contact.accessLevel).toBe('LIMITED');
      expect(JSON.stringify(result)).not.toContain('501234567');
    });

    it('returns the FULL view once the grant exists', async () => {
      accessRequests.verifyPhone.mockResolvedValue(true);
      accessRequests.grantedContactIds.mockResolvedValue(
        new Set(['contact-uuid-1']),
      );

      const result = await service.verifyPhone(
        'contact-uuid-1',
        companyId,
        '0501234567',
        agent,
      );

      expect(result.verified).toBe(true);
      expect(result.contact.accessLevel).toBe('FULL');
    });

    it('404s a contact of another company before checking anything', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyPhone('contact-uuid-1', 'other', '0501234567', agent),
      ).rejects.toThrow(NotFoundException);
      expect(accessRequests.verifyPhone).not.toHaveBeenCalled();
    });
  });
});
