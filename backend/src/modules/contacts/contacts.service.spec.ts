import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@shared/enums/roles.enum';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { Contact } from './entities/contact.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WhatsappChat } from '../whatsapp/entities/whatsapp-chat.entity';
import { Company } from '../companies/entities/company.entity';

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

  const companyId = 'company-uuid-1';
  const adminCaller = { role: 'company_admin', regionCodes: ['dubai'] };

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
    createdBy: 'user-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Contact;

  beforeEach(async () => {
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
      expect(result).toEqual(mockContact);
    });

    it('resolves by phone suffix when the number is already a contact', async () => {
      repo.find.mockResolvedValue([mockContact]);
      repo.findOne.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, {
        firstName: 'Ahmed',
        phone: '+971501234567',
      });
      expect(result.id).toBe('contact-uuid-1');
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
      expect(result).toEqual(mockContact);
    });

    it('creates when neither phone nor email is present', async () => {
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, {
        firstName: 'Anon',
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual(mockContact);
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

      const result = await service.findOne('contact-uuid-1', companyId);

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
        { role: Role.AGENT, regionCodes: ['makkah', 'punjab'] },
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
        { role: Role.AGENT, regionCodes: ['makkah'] },
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
        { role: Role.AGENT, regionCodes: [] },
      );

      expect(result.data).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('leaves an admin unconfined', async () => {
      const qb = arrangeList();

      await service.findAll(companyId, 1, 20, undefined, undefined, undefined, {
        role: Role.COMPANY_ADMIN,
        regionCodes: [],
      });

      const regionCalls = (qb.andWhere as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes('region_code'),
      );
      expect(regionCalls).toHaveLength(0);
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
      await expect(service.remove('missing-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes outright when the contact has no edges', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.count.mockResolvedValue(0);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);

      await service.remove('contact-uuid-1', companyId);

      expect(repo.delete).toHaveBeenCalledWith({
        id: 'contact-uuid-1',
        companyId,
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('requires a transfer target when the contact has edges', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.count.mockResolvedValue(2);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);

      await expect(service.remove('contact-uuid-1', companyId)).rejects.toThrow(
        BadRequestException,
      );
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

      await service.remove('contact-uuid-1', companyId, 'contact-uuid-2');

      expect(manager.update).toHaveBeenCalledWith(
        Lead,
        { contactId: 'contact-uuid-1', companyId },
        { contactId: 'contact-uuid-2' },
      );
      expect(manager.delete).toHaveBeenCalledWith(Contact, {
        id: 'contact-uuid-1',
        companyId,
      });
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
      it('denies findOne on a contact outside the caller assigned regions', async () => {
        seedContactInRegion('punjab');

        await expect(
          service.findOne('contact-uuid-1', companyId, makkahManager),
        ).rejects.toThrow(NotFoundException);
      });

      it('denies findOneEntity on a contact outside the caller assigned regions', async () => {
        seedContactInRegion('punjab');

        await expect(
          service.findOneEntity('contact-uuid-1', companyId, makkahManager),
        ).rejects.toThrow(NotFoundException);
      });

      it('denies update on a contact outside the caller assigned regions', async () => {
        seedContactInRegion('punjab');

        await expect(
          service.update(
            'contact-uuid-1',
            companyId,
            { firstName: 'Khalid' },
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies remove on a contact outside the caller assigned regions', async () => {
        seedContactInRegion('punjab');

        await expect(
          service.remove('contact-uuid-1', companyId, undefined, makkahManager),
        ).rejects.toThrow(NotFoundException);
        expect(repo.delete).not.toHaveBeenCalled();
      });

      it('denies every by-id read when the caller has no assigned region', async () => {
        seedContactInRegion('makkah');

        await expect(
          service.findOne('contact-uuid-1', companyId, {
            role: 'manager',
            regionCodes: [],
          }),
        ).rejects.toThrow(NotFoundException);
        expect(repo.findOne).not.toHaveBeenCalled();
      });

      it('allows a by-id read in any region the caller is assigned to', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOne(
          'contact-uuid-1',
          companyId,
          twoRegionManager,
        );

        expect(result.id).toBe('contact-uuid-1');
      });

      it('leaves admins unconfined by their own assignments', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOne(
          'contact-uuid-1',
          companyId,
          admin,
        );

        expect(result.id).toBe('contact-uuid-1');
      });

      it('stays unscoped when no caller is supplied', async () => {
        seedContactInRegion('punjab');

        const result = await service.findOneEntity('contact-uuid-1', companyId);

        expect(result.id).toBe('contact-uuid-1');
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
});
