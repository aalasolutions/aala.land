import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { Contact } from './entities/contact.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WhatsappChat } from '../whatsapp/entities/whatsapp-chat.entity';

// A query-builder mock that records the chained fluent calls and resolves from
// the given result. Used for findAll + the tag-derivation sub-queries.
function qbMock(result: { getMany?: unknown[]; getManyAndCount?: [unknown[], number]; getRawMany?: unknown[] }) {
  const chain: Record<string, jest.Mock> = {};
  const mk = (key: string, returned?: unknown) => {
    chain[key] = jest.fn().mockReturnValue(returned ?? chain);
  };
  ['createQueryBuilder', 'where', 'andWhere', 'skip', 'take', 'orderBy', 'leftJoin', 'leftJoinAndSelect', 'select', 'addSelect', 'groupBy'].forEach((m) => mk(m));
  chain.getManyAndCount = jest.fn().mockResolvedValue(result.getManyAndCount ?? [[], 0]);
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
  let dataSource: { transaction: jest.Mock };

  const companyId = 'company-uuid-1';

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
        { provide: getRepositoryToken(Contact), useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn(), remove: jest.fn(), delete: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Lead), useValue: { count: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Unit), useValue: { count: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Lease), useValue: { count: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(WhatsappChat), useValue: { count: jest.fn(), query: jest.fn().mockResolvedValue(undefined) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    repo = module.get(getRepositoryToken(Contact));
    leadRepo = module.get(getRepositoryToken(Lead));
    unitRepo = module.get(getRepositoryToken(Unit));
    leaseRepo = module.get(getRepositoryToken(Lease));
    chatRepo = module.get(getRepositoryToken(WhatsappChat));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    function stubReload() {
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValue(mockContact);
      leadRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
      leaseRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
      unitRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
    }

    it('creates and returns a contact with createdBy', async () => {
      const dto = { firstName: 'Ahmed', phone: '+971501234567' };
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      stubReload();

      const result = await service.create(companyId, dto as any, 'user-uuid-1');

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId, createdBy: 'user-uuid-1' });
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

      await service.create(companyId, dto as any, 'user-uuid-1');

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
      const result = await service.resolveOrCreate(companyId, { contactId: 'contact-uuid-1' });
      expect(result).toEqual(mockContact);
    });

    it('resolves by phone suffix when the number is already a contact', async () => {
      repo.find.mockResolvedValue([mockContact]);
      repo.findOne.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, { firstName: 'Ahmed', phone: '+971501234567' });
      expect(result.id).toBe('contact-uuid-1');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates a new contact when no phone matches', async () => {
      repo.find.mockResolvedValue([]);
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, { firstName: 'New', phone: '+971555000111' });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual(mockContact);
    });

    it('creates when neither phone nor email is present', async () => {
      repo.create.mockReturnValue(mockContact);
      repo.save.mockResolvedValue(mockContact);
      const result = await service.resolveOrCreate(companyId, { firstName: 'Anon' });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual(mockContact);
    });
  });

  describe('findOne', () => {
    it('returns a serialized contact with derived tags', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [{ id: mockContact.id }] }) as any);
      leaseRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
      unitRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);

      const result = await service.findOne('contact-uuid-1', companyId);

      expect(result.tags).toContain('lead');
      expect(result.displayName).toBe('Ahmed Al-Rashid');
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    function stubQueryBuilders() {
      const qb = qbMock({ getManyAndCount: [[mockContact], 1] });
      repo.createQueryBuilder.mockReturnValue(qb as any);
      leadRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
      leaseRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
      unitRepo.createQueryBuilder.mockReturnValue(qbMock({ getRawMany: [] }) as any);
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

      expect(repo.delete).toHaveBeenCalledWith({ id: 'contact-uuid-1', companyId });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('requires a transfer target when the contact has edges', async () => {
      repo.findOne.mockResolvedValue(mockContact);
      leadRepo.count.mockResolvedValue(2);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chatRepo.count.mockResolvedValue(0);

      await expect(service.remove('contact-uuid-1', companyId)).rejects.toThrow(BadRequestException);
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
      dataSource.transaction.mockImplementation((cb: (m: EntityManager) => Promise<void>) => cb(manager as unknown as EntityManager));

      await service.remove('contact-uuid-1', companyId, 'contact-uuid-2');

      expect(manager.update).toHaveBeenCalledWith(Lead, { contactId: 'contact-uuid-1', companyId }, { contactId: 'contact-uuid-2' });
      expect(manager.delete).toHaveBeenCalledWith(Contact, { id: 'contact-uuid-1', companyId });
    });
  });
});
