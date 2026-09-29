import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import {
  Lead,
  LeadStatus,
  LeadTemperature,
  LeadSource,
} from './entities/lead.entity';
import { LeadActivity, ActivityType } from './entities/lead-activity.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Locality } from '../locations/entities/locality.entity';
import { City } from '../locations/entities/city.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Role } from '@shared/enums/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ContactsService } from '../contacts/contacts.service';
import { ContactPrivacyService } from '../contacts/contact-privacy.service';
import { ContactAttachService } from '../contacts/contact-attach.service';
import { ContactAccessRequestsService } from '../contact-access-requests/contact-access-requests.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let leadRepo: jest.Mocked<Repository<Lead>>;
  let activityRepo: jest.Mocked<Repository<LeadActivity>>;
  let companyRepo: jest.Mocked<Repository<Company>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let localityRepo: jest.Mocked<Repository<Locality>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let contactsService: { resolveOrCreate: jest.Mock; findOneEntity: jest.Mock };
  let privacy: { presentMany: jest.Mock; accessLevelFor: jest.Mock };
  let accessRequests: {
    grantLink: jest.Mock;
    verifyPhone: jest.Mock;
    raiseRequest: jest.Mock;
  };
  let module: TestingModule;
  let manager: {
    getRepository: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    query: jest.Mock;
  };

  const companyId = 'company-uuid-1';

  const mockLead: Partial<Lead> = {
    id: 'lead-uuid-1',
    companyId,
    contactId: 'contact-uuid-1',
    contact: {
      firstName: 'Ahmed',
      lastName: 'Al-Rashid',
      phone: '+971501234567',
    } as any,
    status: LeadStatus.NEW,
    temperature: LeadTemperature.WARM,
    source: LeadSource.WHATSAPP,
    score: 50,
  };

  const mockActivity: Partial<LeadActivity> = {
    id: 'activity-uuid-1',
    leadId: 'lead-uuid-1',
    companyId,
    type: ActivityType.NOTE,
    notes: 'First contact made',
  };

  // Identity now lives on the contact. create() derives the contact via
  // ContactsService.resolveOrCreate; this helper builds the mock contact a test
  // wants resolveOrCreate to return.
  const contact = (firstName: string, lastName = '', phone = '+97150000000') =>
    ({ id: 'contact-uuid-1', firstName, lastName, phone, companyId }) as any;

  beforeEach(async () => {
    privacy = {
      presentMany: jest.fn((_c: string, _v: unknown, rows: unknown[]) =>
        Promise.resolve(rows),
      ),
      accessLevelFor: jest.fn((_c: string, _v: unknown, rows: any[]) =>
        Promise.resolve(new Map(rows.map((r) => [r.id, 'FULL']))),
      ),
    };
    accessRequests = {
      grantLink: jest.fn().mockResolvedValue(undefined),
      verifyPhone: jest.fn(),
      raiseRequest: jest.fn().mockResolvedValue({}),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === LeadActivity ? activityRepo : leadRepo,
      ),
      findOne: jest.fn((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Lead ? { id: opts.where.id, unitId: null } : null,
        ),
      ),
      find: jest.fn(),
      query: jest.fn(),
    };
    module = await Test.createTestingModule({
      providers: [
        LeadsService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
          },
        },
        {
          provide: getRepositoryToken(Lead),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeadActivity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Locality),
          useValue: {
            findOne: jest.fn(),
            exist: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(City),
          useValue: {
            exist: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: ContactsService,
          useValue: {
            resolveOrCreate: jest.fn(),
            findOneEntity: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findAdmins: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: NotificationsGateway,
          useValue: {
            broadcastToCompany: jest.fn(),
          },
        },
        ContactAttachService,
        { provide: ContactPrivacyService, useValue: privacy },
        { provide: ContactAccessRequestsService, useValue: accessRequests },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
    leadRepo = module.get(getRepositoryToken(Lead));
    activityRepo = module.get(getRepositoryToken(LeadActivity));
    companyRepo = module.get(getRepositoryToken(Company));
    userRepo = module.get(getRepositoryToken(User));
    localityRepo = module.get(getRepositoryToken(Locality));
    unitRepo = module.get(getRepositoryToken(Unit));
    contactsService = module.get(ContactsService);
    // Default: resolveOrCreate returns a contact carrying the lead's name.
    contactsService.resolveOrCreate.mockResolvedValue({
      contact: contact('Ahmed', 'Al-Rashid'),
      existing: false,
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a lead against the resolved contact', async () => {
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(mockLead as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead } as Lead);

      const dto = { firstName: 'Ahmed', source: LeadSource.WHATSAPP };
      const result = await service.create(companyId, dto as any);

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        expect.any(Object),
        undefined,
        expect.any(String),
        undefined,
      );
      expect(leadRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: 'contact-uuid-1',
          companyId,
          regionCode: 'dubai',
        }),
      );
      expect(result).toEqual({
        ...mockLead,
        contact: contact('Ahmed', 'Al-Rashid'),
        assignedAgentName: null,
        contactAccess: 'LIMITED',
      });
    });

    it('rejects create with no contact and no identifying detail', async () => {
      await expect(service.create(companyId, {} as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(contactsService.resolveOrCreate).not.toHaveBeenCalled();
    });

    it('accepts a last name alone as identifying detail', async () => {
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      contactsService.resolveOrCreate.mockResolvedValue({
        contact: { id: 'contact-uuid-1' },
        existing: false,
      } as any);
      leadRepo.create.mockReturnValue(mockLead as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead } as Lead);

      await service.create(companyId, {
        lastName: 'Al-Rashid Holdings',
      } as any);

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ lastName: 'Al-Rashid Holdings' }),
        undefined,
        expect.any(String),
        undefined,
      );
    });

    it('validates property/locality exists in create', async () => {
      localityRepo.exist.mockResolvedValue(false);
      const dto = { localityId: 'other-company-locality' };

      await expect(service.create(companyId, dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(localityRepo.exist).toHaveBeenCalledWith({
        where: { id: 'other-company-locality' },
      });
    });

    it('validates unit ownership in create', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      const dto = { unitId: 'other-company-unit' };

      await expect(service.create(companyId, dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(unitRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'other-company-unit', companyId },
      });
    });

    it('refuses to link an archived unit with 409', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'archived-unit',
        companyId,
        deletedAt: new Date(),
      } as Unit);

      await expect(
        service.create(companyId, { unitId: 'archived-unit' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('broadcasts a leadUpdated event on create', async () => {
      const clientLead: Partial<Lead> = {
        id: 'lead-uuid-2',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.WHATSAPP,
        score: 0,
        assignedTo: 'agent-uuid-1',
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(clientLead as Lead);
      leadRepo.save.mockResolvedValue(clientLead as Lead);

      await service.create(companyId, {
        firstName: 'Clara',
        source: LeadSource.WHATSAPP,
      } as any);

      expect(
        module!.get(NotificationsGateway).broadcastToCompany,
      ).toHaveBeenCalledWith(
        companyId,
        'leadUpdated',
        expect.objectContaining({
          id: 'lead-uuid-2',
          status: LeadStatus.NEW,
          assignedTo: 'agent-uuid-1',
        }),
      );
    });

    it('sends LEAD_ASSIGNED notification to the assigned agent', async () => {
      const clientLead: Partial<Lead> = {
        id: 'lead-assigned-1',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.WHATSAPP,
        score: 0,
        assignedTo: 'agent-uuid-1',
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(clientLead as Lead);
      leadRepo.save.mockResolvedValue(clientLead as Lead);
      contactsService.resolveOrCreate.mockResolvedValue({
        contact: contact('Samir', 'Hassan'),
        existing: false,
      });
      const notificationsService = module!.get(NotificationsService);

      await service.create(companyId, {
        firstName: 'Samir',
        source: LeadSource.WHATSAPP,
      } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          userId: 'agent-uuid-1',
          title: 'New Lead Assigned',
          message: 'You have been assigned a new lead: Samir Hassan',
          type: NotificationType.LEAD_ASSIGNED,
          entityType: 'lead',
          entityId: 'lead-assigned-1',
        }),
      );
    });

    it('does NOT send LEAD_ASSIGNED notification if user creates lead already assigned to themselves', async () => {
      const clientLead: Partial<Lead> = {
        id: 'lead-self-assigned',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.WHATSAPP,
        score: 0,
        assignedTo: 'creator-user-id',
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(clientLead as Lead);
      leadRepo.save.mockResolvedValue(clientLead as Lead);
      const notificationsService = module!.get(NotificationsService);

      await service.create(
        companyId,
        { firstName: 'Nadia' } as any,
        'creator-user-id',
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('does NOT send LEAD_UNASSIGNED notification if admin creates lead assigned to an agent', async () => {
      const clientLead: Partial<Lead> = {
        id: 'lead-assigned-2',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.WHATSAPP,
        score: 0,
        assignedTo: 'agent-uuid-2',
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(clientLead as Lead);
      leadRepo.save.mockResolvedValue(clientLead as Lead);
      const notificationsService = module!.get(NotificationsService);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        { id: 'admin-1', name: 'Super Admin', email: 'super@company.com' },
      ]);

      await service.create(companyId, { firstName: 'Omar' } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          userId: 'agent-uuid-2',
          type: NotificationType.LEAD_ASSIGNED,
        }),
      );
    });

    it('skips LEAD_UNASSIGNED notification for admin creator when lead has no assigned agent', async () => {
      const noAssignLead: Partial<Lead> = {
        id: 'lead-no-assign',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.REFERRAL,
        score: 0,
        assignedTo: null,
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(noAssignLead as Lead);
      leadRepo.save.mockResolvedValue(noAssignLead as Lead);
      const notificationsService = module!.get(NotificationsService);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        {
          id: 'creator-user-id',
          name: 'Admin Creator',
          email: 'creator@company.com',
        },
      ]);

      await service.create(
        companyId,
        { firstName: 'Rania' } as any,
        'creator-user-id',
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('sends LEAD_UNASSIGNED notifications to all other admins when lead has no assigned agent', async () => {
      const noAssignLead: Partial<Lead> = {
        id: 'lead-unassigned-multi',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.WEBSITE,
        score: 0,
        assignedTo: null,
      };
      const admin1 = {
        id: 'admin-not-creator',
        name: 'Admin One',
        email: 'admin1@company.com',
      };
      const admin2 = {
        id: 'admin2-also-not',
        name: 'Admin Two',
        email: 'admin2@company.com',
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(noAssignLead as Lead);
      leadRepo.save.mockResolvedValue(noAssignLead as Lead);
      contactsService.resolveOrCreate.mockResolvedValue({
        contact: contact('Layla', 'Ibrahim'),
        existing: false,
      });
      const notificationsService = module!.get(NotificationsService);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        admin1,
        admin2,
      ]);

      await service.create(
        companyId,
        { firstName: 'Layla' } as any,
        'creator-user-id',
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          userId: 'admin-not-creator',
          title: 'New Unassigned Lead',
          message:
            'A new lead for Layla Ibrahim has been created and needs assignment.',
          type: NotificationType.LEAD_UNASSIGNED,
          entityType: 'lead',
          entityId: 'lead-unassigned-multi',
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          userId: 'admin2-also-not',
          title: 'New Unassigned Lead',
          type: NotificationType.LEAD_UNASSIGNED,
        }),
      );
    });

    it('formats first name only when lastName is empty', async () => {
      const noAssignLead: Partial<Lead> = {
        id: 'lead-no-lastname',
        companyId,
        status: LeadStatus.NEW,
        temperature: LeadTemperature.WARM,
        source: LeadSource.OTHER,
        score: 0,
        assignedTo: 'agent-uuid-1',
      };
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(noAssignLead as Lead);
      leadRepo.save.mockResolvedValue(noAssignLead as Lead);
      contactsService.resolveOrCreate.mockResolvedValue({
        contact: contact('Salma', ''),
        existing: false,
      });
      const notificationsService = module!.get(NotificationsService);

      await service.create(companyId, { firstName: 'Salma' } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          userId: 'agent-uuid-1',
          message: 'You have been assigned a new lead: Salma',
          type: NotificationType.LEAD_ASSIGNED,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('scopes to contactId when supplied', async () => {
      leadRepo.findAndCount.mockResolvedValue([[mockLead as Lead], 1]);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        'contact-uuid-1',
      );

      expect(leadRepo.findAndCount).toHaveBeenCalledWith({
        where: { companyId, contactId: 'contact-uuid-1' },
        relations: ['contact', 'city', 'locality', 'unit', 'assignedAgent'],
        skip: 0,
        take: 20,
        order: {
          position: { direction: 'ASC', nulls: 'FIRST' },
          createdAt: 'DESC',
        },
      });
      expect(result.data).toEqual([{ ...mockLead, assignedAgentName: null }]);
      expect(result.total).toBe(1);
    });

    it('returns paginated leads for company', async () => {
      leadRepo.findAndCount.mockResolvedValue([[mockLead as Lead], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(leadRepo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        relations: ['contact', 'city', 'locality', 'unit', 'assignedAgent'],
        ...{ skip: 0, take: 20 },
        order: {
          position: { direction: 'ASC', nulls: 'FIRST' },
          createdAt: 'DESC',
        },
      });
      expect(result.data).toEqual([{ ...mockLead, assignedAgentName: null }]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns lead when found', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);

      const result = await service.findOne('lead-uuid-1', companyId);

      expect(result).toEqual({ ...mockLead, assignedAgentName: null });
    });

    it('throws NotFoundException when lead not found', async () => {
      leadRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when lead belongs to different company', async () => {
      leadRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('lead-uuid-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates lead fields', async () => {
      leadRepo.findOne
        .mockResolvedValueOnce({ ...mockLead } as Lead)
        .mockResolvedValueOnce({ ...mockLead, score: 75 } as Lead);
      leadRepo.save.mockResolvedValue({ ...mockLead, score: 75 } as Lead);

      const result = await service.update('lead-uuid-1', companyId, {
        score: 75,
      } as any);

      expect(result.score).toBe(75);
      expect(result.assignedAgentName).toBeNull();
    });

    it('creates activity log when status changes', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithStatus)
        .mockResolvedValueOnce({
          ...leadWithStatus,
          status: LeadStatus.CONTACTED,
        } as Lead);
      leadRepo.save.mockResolvedValue({
        ...leadWithStatus,
        status: LeadStatus.CONTACTED,
      } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update('lead-uuid-1', companyId, {
        status: LeadStatus.CONTACTED,
      } as any);

      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.STATUS_CHANGE }),
      );
    });

    it('sets stageEnteredAt when status changes', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithStatus)
        .mockResolvedValueOnce({
          ...leadWithStatus,
          status: LeadStatus.CONTACTED,
        } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update('lead-uuid-1', companyId, {
        status: LeadStatus.CONTACTED,
      } as any);

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.stageEnteredAt).toBeInstanceOf(Date);
    });

    it('clears position when status changes, keeps it otherwise', async () => {
      const positioned = {
        ...mockLead,
        status: LeadStatus.NEW,
        position: 3,
      } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce({ ...positioned })
        .mockResolvedValueOnce({ ...positioned })
        .mockResolvedValueOnce({ ...positioned })
        .mockResolvedValueOnce({ ...positioned });
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update('lead-uuid-1', companyId, { score: 80 } as any);
      await service.update('lead-uuid-1', companyId, {
        status: LeadStatus.CONTACTED,
      } as any);

      expect((leadRepo.save.mock.calls[0][0] as Lead).position).toBe(3);
      expect((leadRepo.save.mock.calls[1][0] as Lead).position).toBeNull();
    });

    it('does not set stageEnteredAt when status does not change', async () => {
      const leadWithStatus = { ...mockLead, status: LeadStatus.NEW } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithStatus)
        .mockResolvedValueOnce(leadWithStatus);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);

      await service.update('lead-uuid-1', companyId, { score: 80 } as any);

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.stageEnteredAt).toBeUndefined();
    });

    it('clears property and unit relations when ids are explicitly unset', async () => {
      const leadWithRelations = {
        ...mockLead,
        localityId: 'locality-uuid-1',
        unitId: 'unit-uuid-1',
        locality: { id: 'locality-uuid-1', name: 'Dubai Marina' },
        unit: { id: 'unit-uuid-1', unitNumber: '1204' },
      } as unknown as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithRelations)
        .mockResolvedValueOnce({
          ...leadWithRelations,
          localityId: null,
          unitId: null,
          locality: null,
          unit: null,
        } as unknown as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);

      await service.update('lead-uuid-1', companyId, {
        localityId: null,
        unitId: null,
      } as any);

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.localityId).toBeNull();
      expect(savedLead.unitId).toBeNull();
      expect(savedLead.locality).toBeNull();
      expect(savedLead.unit).toBeNull();
    });

    it('rejects null status updates before saving', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);

      await expect(
        service.update('lead-uuid-1', companyId, { status: null } as any),
      ).rejects.toThrow(BadRequestException);

      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('forbids non-admin assignment changes through update', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);

      await expect(
        service.update(
          'lead-uuid-1',
          companyId,
          { assignedTo: 'agent-uuid-1' } as any,
          'user-uuid-1',
          Role.AGENT,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('validates assigned agent when admin updates assignment', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(
          'lead-uuid-1',
          companyId,
          { assignedTo: 'missing-agent' } as any,
          'user-uuid-1',
          Role.COMPANY_ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('only considers active, non-deleted agents assignable', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(
          'lead-uuid-1',
          companyId,
          { assignedTo: 'deleted-agent' } as any,
          'user-uuid-1',
          Role.COMPANY_ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'deleted-agent',
            companyId,
            isActive: true,
            deletedAt: IsNull(),
          }),
        }),
      );
    });

    it('logs assignment activity when admin updates assignment', async () => {
      const leadWithAgent = {
        ...mockLead,
        assignedTo: 'old-agent-uuid',
      } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithAgent)
        .mockResolvedValueOnce({
          ...leadWithAgent,
          assignedTo: 'new-agent-uuid',
        } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'new-agent-uuid',
        name: 'New Agent',
      } as User);
      activityRepo.create.mockImplementation(
        (activity) => activity as LeadActivity,
      );
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update(
        'lead-uuid-1',
        companyId,
        { assignedTo: 'new-agent-uuid' } as any,
        'admin-uuid',
        Role.COMPANY_ADMIN,
      );

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.previousAgent).toBe('old-agent-uuid');
      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityType.ASSIGNMENT,
          notes: 'Lead assigned to agent New Agent',
          performedBy: 'admin-uuid',
        }),
      );
    });

    it('allows admin to unassign a lead with assignedTo: null', async () => {
      const leadWithAgent = {
        ...mockLead,
        assignedTo: 'old-agent-uuid',
      } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithAgent)
        .mockResolvedValueOnce({ ...leadWithAgent, assignedTo: null } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      activityRepo.create.mockImplementation(
        (activity) => activity as LeadActivity,
      );
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update(
        'lead-uuid-1',
        companyId,
        { assignedTo: null } as any,
        'admin-uuid',
        Role.COMPANY_ADMIN,
      );

      expect(userRepo.findOne).not.toHaveBeenCalled();
      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.assignedTo).toBeNull();
      expect(savedLead.previousAgent).toBe('old-agent-uuid');
    });

    it('validates property/locality exists in update', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);
      localityRepo.exist.mockResolvedValue(false);

      await expect(
        service.update('lead-uuid-1', companyId, {
          localityId: 'other-locality',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(localityRepo.exist).toHaveBeenCalledWith({
        where: { id: 'other-locality' },
      });
    });

    it('validates unit ownership in update', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);
      unitRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('lead-uuid-1', companyId, {
          unitId: 'other-unit',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assign', () => {
    it('assigns lead to agent and logs activity', async () => {
      leadRepo.findOne
        .mockResolvedValueOnce({ ...mockLead } as Lead)
        .mockResolvedValueOnce({
          ...mockLead,
          assignedTo: 'agent-uuid-1',
        } as Lead);
      leadRepo.save.mockResolvedValue({
        ...mockLead,
        assignedTo: 'agent-uuid-1',
      } as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'agent-uuid-1',
        name: 'Agent One',
      } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const result = await service.assign(
        'lead-uuid-1',
        companyId,
        'agent-uuid-1',
      );

      expect(result.assignedTo).toBe('agent-uuid-1');
      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.ASSIGNMENT }),
      );
    });

    it('throws when assigned agent does not exist in the company', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assign('lead-uuid-1', companyId, 'missing-agent'),
      ).rejects.toThrow(NotFoundException);
      expect(leadRepo.save).not.toHaveBeenCalled();
      expect(activityRepo.save).not.toHaveBeenCalled();
    });

    it('saves previousAgent and transferReason when reassigning', async () => {
      const leadWithAgent = {
        ...mockLead,
        assignedTo: 'old-agent-uuid',
      } as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadWithAgent)
        .mockResolvedValueOnce({
          ...leadWithAgent,
          assignedTo: 'new-agent-uuid',
        } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'new-agent-uuid',
        name: 'New Agent',
      } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.assign(
        'lead-uuid-1',
        companyId,
        'new-agent-uuid',
        'admin-uuid',
        'Client prefers Arabic speaker',
      );

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.previousAgent).toBe('old-agent-uuid');
      expect(savedLead.transferReason).toBe('Client prefers Arabic speaker');
      expect(savedLead.assignedTo).toBe('new-agent-uuid');
    });

    it('includes reason in activity notes when provided', async () => {
      leadRepo.findOne
        .mockResolvedValueOnce({ ...mockLead } as Lead)
        .mockResolvedValueOnce({
          ...mockLead,
          assignedTo: 'agent-uuid-1',
        } as Lead);
      leadRepo.save.mockResolvedValue({
        ...mockLead,
        assignedTo: 'agent-uuid-1',
      } as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'agent-uuid-1',
        name: 'Agent One',
      } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.assign(
        'lead-uuid-1',
        companyId,
        'agent-uuid-1',
        'admin-uuid',
        'Test reason',
      );

      expect(activityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityType.ASSIGNMENT,
          notes: expect.stringContaining('reason: Test reason'),
        }),
      );
    });

    it('does not set previousAgent when no existing agent', async () => {
      const leadNoAgent = { ...mockLead, assignedTo: null } as unknown as Lead;
      leadRepo.findOne
        .mockResolvedValueOnce(leadNoAgent)
        .mockResolvedValueOnce({
          ...leadNoAgent,
          assignedTo: 'agent-uuid-1',
        } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'agent-uuid-1',
        name: 'Agent One',
      } as User);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.assign('lead-uuid-1', companyId, 'agent-uuid-1');

      const savedLead = leadRepo.save.mock.calls[0][0] as Lead;
      expect(savedLead.previousAgent).toBeUndefined();
    });
  });

  describe('archived unit lock', () => {
    const lockedMessage =
      'This unit is archived. Its records can no longer be edited.';
    const archivedUnit = { id: 'unit-archived', deletedAt: new Date() };
    const leadOnArchivedUnit = () =>
      ({
        ...mockLead,
        unitId: 'unit-archived',
        unit: archivedUnit,
      }) as unknown as Lead;

    // Stands in for the locked reads inside the transaction.
    const seedLocked = (
      leadUnitId: string | null,
      units: Record<string, Partial<Unit>>,
    ) =>
      manager.findOne.mockImplementation((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Lead
            ? { id: opts.where.id, unitId: leadUnitId }
            : (units[opts.where.id] ?? null),
        ),
      );

    const expectLeadLock = (mode: string) => {
      expect(manager.findOne).toHaveBeenCalledWith(Lead, {
        where: { id: 'lead-uuid-1', companyId },
        select: { id: true, unitId: true },
        lock: { mode },
      });
    };

    const expectUnitShareLock = (unitId: string) => {
      expect(manager.findOne).toHaveBeenCalledWith(Unit, {
        where: { id: unitId, companyId },
        select: { id: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
    };

    it('refuses update', async () => {
      leadRepo.findOne.mockResolvedValue(leadOnArchivedUnit());
      seedLocked('unit-archived', { 'unit-archived': archivedUnit });

      await expect(
        service.update('lead-uuid-1', companyId, {
          status: LeadStatus.CONTACTED,
        }),
      ).rejects.toThrow(lockedMessage);
      expectLeadLock('pessimistic_write');
      expectUnitShareLock('unit-archived');
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses update when the unit is archived after the first read', async () => {
      leadRepo.findOne.mockResolvedValue({
        ...mockLead,
        unitId: 'unit-archived',
        unit: { id: 'unit-archived', deletedAt: null },
      } as unknown as Lead);
      seedLocked('unit-archived', { 'unit-archived': archivedUnit });

      await expect(
        service.update('lead-uuid-1', companyId, { score: 10 } as any),
      ).rejects.toThrow(lockedMessage);
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses update that moves the lead off the archived unit', async () => {
      leadRepo.findOne.mockResolvedValue(leadOnArchivedUnit());
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-live',
        deletedAt: null,
      } as Unit);
      seedLocked('unit-archived', { 'unit-archived': archivedUnit });

      await expect(
        service.update('lead-uuid-1', companyId, { unitId: 'unit-live' }),
      ).rejects.toThrow(ConflictException);
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses moving a lead onto a unit archived after the first read', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-target',
        deletedAt: null,
      } as Unit);
      seedLocked(null, {
        'unit-target': { id: 'unit-target', deletedAt: new Date() },
      });

      await expect(
        service.update('lead-uuid-1', companyId, { unitId: 'unit-target' }),
      ).rejects.toThrow('This unit is archived.');
      expectUnitShareLock('unit-target');
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the unit is archived after the first read', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-target',
        companyId,
        deletedAt: null,
      } as Unit);
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(mockLead as Lead);
      seedLocked(null, {
        'unit-target': { id: 'unit-target', deletedAt: new Date() },
      });

      await expect(
        service.create(companyId, {
          firstName: 'Ahmed',
          unitId: 'unit-target',
        } as any),
      ).rejects.toThrow('This unit is archived.');
      expectUnitShareLock('unit-target');
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the unit is deleted while waiting for the lock', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-gone',
        companyId,
        deletedAt: null,
      } as Unit);
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      leadRepo.create.mockReturnValue(mockLead as Lead);
      seedLocked(null, {});

      await expect(
        service.create(companyId, {
          firstName: 'Ahmed',
          unitId: 'unit-gone',
        } as any),
      ).rejects.toThrow(new BadRequestException('Invalid unit selected'));
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses assign', async () => {
      leadRepo.findOne.mockResolvedValue(leadOnArchivedUnit());
      userRepo.findOne.mockResolvedValue({
        id: 'agent-uuid-1',
        name: 'Agent One',
      } as User);
      seedLocked('unit-archived', { 'unit-archived': archivedUnit });

      await expect(
        service.assign('lead-uuid-1', companyId, 'agent-uuid-1'),
      ).rejects.toThrow(lockedMessage);
      expectLeadLock('pessimistic_write');
      expectUnitShareLock('unit-archived');
      expect(leadRepo.save).not.toHaveBeenCalled();
      expect(activityRepo.save).not.toHaveBeenCalled();
    });

    it('refuses convert', async () => {
      leadRepo.findOne.mockResolvedValue(leadOnArchivedUnit());
      seedLocked('unit-archived', { 'unit-archived': archivedUnit });

      await expect(service.convert('lead-uuid-1', companyId)).rejects.toThrow(
        lockedMessage,
      );
      expectLeadLock('pessimistic_write');
      expectUnitShareLock('unit-archived');
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('refuses addActivity', async () => {
      leadRepo.findOne.mockResolvedValue(leadOnArchivedUnit());
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      seedLocked('unit-archived', { 'unit-archived': archivedUnit });

      await expect(
        service.addActivity('lead-uuid-1', companyId, {
          type: ActivityType.NOTE,
          notes: 'x',
        }),
      ).rejects.toThrow(lockedMessage);
      expectLeadLock('pessimistic_read');
      expectUnitShareLock('unit-archived');
      expect(activityRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('convert', () => {
    it('converts lead to WON status', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      leadRepo.save.mockResolvedValue({
        ...mockLead,
        status: LeadStatus.WON,
      } as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const result = await service.convert('lead-uuid-1', companyId);

      expect(result.status).toBe(LeadStatus.WON);
    });
  });

  describe('addActivity', () => {
    it('adds activity to lead', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);
      activityRepo.create.mockReturnValue(mockActivity as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      const dto = { type: ActivityType.NOTE, notes: 'First contact' };
      const result = await service.addActivity('lead-uuid-1', companyId, dto);

      expect(activityRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockActivity);
    });

    it('throws NotFoundException when lead not found', async () => {
      leadRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addActivity('bad-id', companyId, {
          type: ActivityType.NOTE,
          notes: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActivities', () => {
    it('returns activities for lead', async () => {
      leadRepo.findOne.mockResolvedValue(mockLead as Lead);
      activityRepo.find.mockResolvedValue([mockActivity as LeadActivity]);

      const result = await service.findActivities('lead-uuid-1', companyId);

      expect(activityRepo.find).toHaveBeenCalledWith({
        where: { leadId: 'lead-uuid-1', companyId },
        relations: ['performer'],
        order: { createdAt: 'DESC' },
        take: 200,
      });
      expect(result).toEqual([{ ...mockActivity, performedByName: null }]);
    });
  });
  describe('reorder', () => {
    const id1 = '11111111-1111-4111-8111-111111111111';
    const id2 = '22222222-2222-4222-8222-222222222222';
    const id3 = '33333333-3333-4333-8333-333333333333';
    const dto = { status: LeadStatus.NEW, orderedIds: [id1, id2, id3] };
    const row = (id: string, status = LeadStatus.NEW) => ({ id, status });

    it('filters the lookup by companyId and locks the rows', async () => {
      manager.find.mockResolvedValue([row(id1), row(id2), row(id3)]);

      await service.reorder(companyId, dto, 'user-uuid-1');

      const [entity, opts] = manager.find.mock.calls[0];
      expect(entity).toBe(Lead);
      expect(opts.where.companyId).toBe(companyId);
      expect(opts.where.id.value).toEqual([id1, id2, id3]);
      expect(opts.where.regionCode).toBeUndefined();
      expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
    });

    it('writes position = index in one company-scoped update', async () => {
      manager.find.mockResolvedValue([row(id1), row(id2), row(id3)]);

      const result = await service.reorder(companyId, dto, 'user-uuid-1');

      expect(result).toEqual({ updated: 3 });
      const [sql, params] = manager.query.mock.calls[0];
      expect(sql).toContain('"company_id" = $3');
      expect(sql).toContain('"status" = $4');
      expect(params).toEqual([
        [id1, id2, id3],
        [0, 1, 2],
        companyId,
        LeadStatus.NEW,
      ]);
    });

    it('skips ids that are no longer in the target status', async () => {
      manager.find.mockResolvedValue([
        row(id1),
        row(id2, LeadStatus.CONTACTED),
        row(id3),
      ]);

      const result = await service.reorder(companyId, dto, 'user-uuid-1');

      expect(result).toEqual({ updated: 2 });
      expect(manager.query.mock.calls[0][1].slice(0, 2)).toEqual([
        [id1, id3],
        [0, 2],
      ]);
    });

    it('404s the whole request when any id is outside the company', async () => {
      manager.find.mockResolvedValue([row(id1), row(id3)]);

      await expect(
        service.reorder(companyId, dto, 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('narrows the lookup to the caller assigned regions', async () => {
      manager.find.mockResolvedValue([row(id1), row(id2), row(id3)]);

      await service.reorder(companyId, dto, 'user-uuid-1', {
        role: Role.AGENT,
        regionCodes: ['makkah'],
      });

      expect(manager.find.mock.calls[0][1].where.regionCode.value).toEqual([
        'makkah',
      ]);
    });

    it('404s a caller with no region assignments without querying', async () => {
      await expect(
        service.reorder(companyId, dto, 'user-uuid-1', {
          role: Role.AGENT,
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(manager.find).not.toHaveBeenCalled();
    });

    it('ignores the caller regions for a company admin', async () => {
      manager.find.mockResolvedValue([row(id1), row(id2), row(id3)]);

      await service.reorder(companyId, dto, 'user-uuid-1', {
        role: Role.COMPANY_ADMIN,
        regionCodes: ['makkah'],
      });

      expect(manager.find.mock.calls[0][1].where.regionCode).toBeUndefined();
    });
  });

  describe('region scoping', () => {
    const makkahAgent = {
      userId: 'agent-uuid-1',
      role: Role.AGENT,
      regionCodes: ['makkah'],
    };
    const twoRegionAgent = {
      userId: 'agent-uuid-1',
      role: Role.AGENT,
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = {
      userId: 'admin-uuid-1',
      role: Role.COMPANY_ADMIN,
      regionCodes: ['makkah'],
    };

    function seedLeadInRegion(regionCode: string) {
      const row = { ...mockLead, regionCode } as Lead;
      leadRepo.findOne.mockImplementation((opts: any) => {
        const filter = opts?.where?.regionCode;
        if (filter && !(filter.value as string[]).includes(regionCode)) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });
      return row;
    }

    describe('by-id reads and writes', () => {
      it('denies findOne on a lead outside the caller assigned regions', async () => {
        seedLeadInRegion('punjab');

        await expect(
          service.findOne('lead-uuid-1', companyId, makkahAgent),
        ).rejects.toThrow(NotFoundException);
      });

      it('denies update on a lead outside the caller assigned regions', async () => {
        seedLeadInRegion('punjab');

        await expect(
          service.update(
            'lead-uuid-1',
            companyId,
            { score: 90 } as any,
            'user-uuid-1',
            Role.AGENT,
            makkahAgent,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(leadRepo.save).not.toHaveBeenCalled();
      });

      it('denies assign on a lead outside the caller assigned regions', async () => {
        seedLeadInRegion('punjab');
        userRepo.findOne.mockResolvedValue({
          id: 'agent-uuid-1',
          name: 'Sara',
        } as User);

        await expect(
          service.assign(
            'lead-uuid-1',
            companyId,
            'agent-uuid-1',
            'user-uuid-1',
            undefined,
            makkahAgent,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(leadRepo.save).not.toHaveBeenCalled();
      });

      it('denies convert on a lead outside the caller assigned regions', async () => {
        seedLeadInRegion('punjab');

        await expect(
          service.convert('lead-uuid-1', companyId, 'user-uuid-1', makkahAgent),
        ).rejects.toThrow(NotFoundException);
        expect(leadRepo.save).not.toHaveBeenCalled();
      });

      it('denies addActivity on a lead outside the caller assigned regions', async () => {
        seedLeadInRegion('punjab');

        await expect(
          service.addActivity(
            'lead-uuid-1',
            companyId,
            { type: ActivityType.NOTE } as any,
            'user-uuid-1',
            makkahAgent,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(activityRepo.save).not.toHaveBeenCalled();
      });

      it('denies findActivities on a lead outside the caller assigned regions', async () => {
        seedLeadInRegion('punjab');

        await expect(
          service.findActivities('lead-uuid-1', companyId, makkahAgent),
        ).rejects.toThrow(NotFoundException);
        expect(activityRepo.find).not.toHaveBeenCalled();
      });

      it('denies every by-id read when the caller has no assigned region', async () => {
        seedLeadInRegion('makkah');

        await expect(
          service.findOne('lead-uuid-1', companyId, {
            userId: 'agent-uuid-1',
            role: Role.AGENT,
            regionCodes: [],
          }),
        ).rejects.toThrow(NotFoundException);
        expect(leadRepo.findOne).not.toHaveBeenCalled();
      });

      it('allows a by-id read in any region the caller is assigned to', async () => {
        seedLeadInRegion('punjab');

        const result = await service.findOne(
          'lead-uuid-1',
          companyId,
          twoRegionAgent,
        );

        expect(result.id).toBe('lead-uuid-1');
      });

      it('leaves admins unconfined by their own assignments', async () => {
        seedLeadInRegion('punjab');

        const result = await service.findOne('lead-uuid-1', companyId, admin);

        expect(result.id).toBe('lead-uuid-1');
      });
    });

    describe('create with a body regionCode', () => {
      beforeEach(() => {
        companyRepo.findOne.mockResolvedValue({
          defaultRegionCode: 'dubai',
          activeRegions: ['dubai', 'makkah', 'punjab'],
        } as Company);
      });

      it('rejects a region outside the caller assigned set with 400', async () => {
        await expect(
          service.create(
            companyId,
            { firstName: 'Ahmed', regionCode: 'punjab' } as any,
            'user-uuid-1',
            makkahAgent,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(leadRepo.save).not.toHaveBeenCalled();
      });

      it('rejects a region the company does not operate, even for an admin', async () => {
        await expect(
          service.create(
            companyId,
            { firstName: 'Ahmed', regionCode: 'atlantis' } as any,
            'user-uuid-1',
            admin,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(leadRepo.save).not.toHaveBeenCalled();
      });

      it('accepts a region inside the caller assigned set', async () => {
        leadRepo.create.mockReturnValue(mockLead as Lead);
        leadRepo.save.mockResolvedValue({ ...mockLead } as Lead);

        await service.create(
          companyId,
          { firstName: 'Ahmed', regionCode: 'makkah' } as any,
          'user-uuid-1',
          makkahAgent,
        );

        expect(leadRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'makkah' }),
        );
      });
    });
  });

  describe('contact access', () => {
    const agentCaller = { role: Role.AGENT, regionCodes: ['dubai'] };
    const managerCaller = { role: Role.MANAGER, regionCodes: ['dubai'] };
    const someoneElses = {
      id: 'contact-uuid-9',
      firstName: 'Test',
      lastName: 'User',
      phone: '+971501234567',
      regionCode: 'makkah',
      createdBy: 'other-user',
      companyId,
    } as any;
    const leadSource = { sourceType: 'lead', sourceId: 'lead-uuid-7' };

    function arrangeCreate(assignedTo: string | null = null) {
      companyRepo.findOne.mockResolvedValue({
        defaultRegionCode: 'dubai',
      } as Company);
      const saved = {
        id: 'lead-uuid-7',
        companyId,
        status: LeadStatus.NEW,
        regionCode: 'dubai',
        assignedTo,
      } as Lead;
      leadRepo.create.mockReturnValue(saved);
      leadRepo.save.mockResolvedValue(saved);
      contactsService.resolveOrCreate.mockResolvedValue({
        contact: someoneElses,
        existing: true,
      });
    }

    function limitedFor(id: string) {
      privacy.accessLevelFor.mockResolvedValue(new Map([[id, 'LIMITED']]));
    }

    it('unlocks the contact when the typed phone matches', async () => {
      arrangeCreate();
      limitedFor('contact-uuid-9');
      accessRequests.verifyPhone.mockResolvedValue(true);

      const result = await service.create(
        companyId,
        { contactId: 'contact-uuid-9', contactVerifyPhone: '0501234567' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(accessRequests.verifyPhone).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-1',
        '0501234567',
        leadSource,
      );
      expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
      expect(result.contactAccess).toBe('FULL');
      expect(leadRepo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ contactVerifyPhone: expect.anything() }),
      );
    });

    it('raises a request with the lead as source when the phone misses', async () => {
      arrangeCreate();
      limitedFor('contact-uuid-9');
      accessRequests.verifyPhone.mockResolvedValue(false);

      const result = await service.create(
        companyId,
        { contactId: 'contact-uuid-9', contactVerifyPhone: '0500000000' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(accessRequests.raiseRequest).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-1',
        leadSource,
        null,
      );
      expect(result.contactAccess).toBe('PENDING');
    });

    it('treats the typed contact phone as the verification on a match', async () => {
      arrangeCreate();
      limitedFor('contact-uuid-9');
      accessRequests.verifyPhone.mockResolvedValue(true);

      const result = await service.create(
        companyId,
        { firstName: 'Test', phone: '0501234567' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(accessRequests.verifyPhone).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-1',
        '0501234567',
        leadSource,
      );
      expect(result.contactAccess).toBe('FULL');
    });

    it('raises a request without verifying when no phone is typed', async () => {
      arrangeCreate();
      limitedFor('contact-uuid-9');

      const result = await service.create(
        companyId,
        { contactId: 'contact-uuid-9' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(accessRequests.verifyPhone).not.toHaveBeenCalled();
      expect(accessRequests.raiseRequest).toHaveBeenCalledTimes(1);
      expect(result.contactAccess).toBe('PENDING');
    });

    it('keeps the saved lead and raises a request when the phone check is rate limited', async () => {
      arrangeCreate();
      limitedFor('contact-uuid-9');
      accessRequests.verifyPhone.mockRejectedValue(
        new HttpException('Too many attempts', HttpStatus.TOO_MANY_REQUESTS),
      );

      const result = await service.create(
        companyId,
        { contactId: 'contact-uuid-9', contactVerifyPhone: '0500000000' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(result.contactAccess).toBe('PENDING');
      expect(accessRequests.raiseRequest).toHaveBeenCalledTimes(1);
    });

    it('requests nothing when the agent already has FULL', async () => {
      arrangeCreate();

      const result = await service.create(
        companyId,
        { contactId: 'contact-uuid-9', contactVerifyPhone: '0501234567' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(accessRequests.verifyPhone).not.toHaveBeenCalled();
      expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
      expect(result.contactAccess).toBe('FULL');
    });

    it('never merges for an agent: the caller role reaches resolveOrCreate', async () => {
      arrangeCreate();

      await service.create(
        companyId,
        { phone: '0501234567' },
        'agent-uuid-1',
        agentCaller,
      );

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        expect.any(Object),
        'agent-uuid-1',
        'dubai',
        Role.AGENT,
      );
    });

    it('links the assigned agent when a manager creates an assigned lead', async () => {
      arrangeCreate('agent-uuid-2');

      await service.create(
        companyId,
        { contactId: 'contact-uuid-9' },
        'manager-uuid-1',
        managerCaller,
      );

      expect(accessRequests.grantLink).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-2',
        'manager-uuid-1',
        leadSource,
      );
      expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
    });

    it('links the new assignee when an admin reassigns through update', async () => {
      const row = {
        ...mockLead,
        id: 'lead-uuid-7',
        contactId: 'contact-uuid-9',
        contact: someoneElses,
        assignedTo: 'old-agent',
      } as Lead;
      leadRepo.findOne.mockResolvedValue({ ...row } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'agent-uuid-2',
        name: 'Agent Two',
      } as User);
      activityRepo.create.mockImplementation((a) => a as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);

      await service.update(
        'lead-uuid-7',
        companyId,
        { assignedTo: 'agent-uuid-2' },
        'admin-uuid-1',
        Role.COMPANY_ADMIN,
        { role: Role.COMPANY_ADMIN, regionCodes: [] },
      );

      expect(accessRequests.grantLink).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-2',
        'admin-uuid-1',
        leadSource,
      );
    });

    it('raises a request, never a phone check, when an agent repoints the contact', async () => {
      const row = { ...mockLead, id: 'lead-uuid-7' } as Lead;
      leadRepo.findOne.mockResolvedValue({ ...row } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      contactsService.findOneEntity.mockResolvedValue(someoneElses);
      limitedFor('contact-uuid-9');

      await service.update(
        'lead-uuid-7',
        companyId,
        { contactId: 'contact-uuid-9' },
        'agent-uuid-1',
        Role.AGENT,
        agentCaller,
      );

      expect(contactsService.findOneEntity).toHaveBeenCalledWith(
        'contact-uuid-9',
        companyId,
      );
      expect(accessRequests.verifyPhone).not.toHaveBeenCalled();
      expect(accessRequests.raiseRequest).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-1',
        leadSource,
        null,
      );
    });

    it('touches no grants when an update leaves contact and assignee alone', async () => {
      leadRepo.findOne.mockResolvedValue({ ...mockLead } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);

      await service.update(
        'lead-uuid-1',
        companyId,
        { notes: 'x' },
        'agent-uuid-1',
        Role.AGENT,
        agentCaller,
      );

      expect(privacy.accessLevelFor).not.toHaveBeenCalled();
      expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
      expect(accessRequests.grantLink).not.toHaveBeenCalled();
    });

    it('raises a request when an agent assigns a lead on someone else contact to themselves', async () => {
      const row = {
        ...mockLead,
        id: 'lead-uuid-7',
        contactId: 'contact-uuid-9',
        contact: someoneElses,
      } as Lead;
      leadRepo.findOne.mockResolvedValue({ ...row } as Lead);
      leadRepo.save.mockImplementation(async (lead) => lead as Lead);
      userRepo.findOne.mockResolvedValue({
        id: 'agent-uuid-1',
        name: 'Agent One',
      } as User);
      activityRepo.create.mockImplementation((a) => a as LeadActivity);
      activityRepo.save.mockResolvedValue(mockActivity as LeadActivity);
      limitedFor('contact-uuid-9');

      await service.assign(
        'lead-uuid-7',
        companyId,
        'agent-uuid-1',
        'agent-uuid-1',
        undefined,
        agentCaller,
      );

      expect(accessRequests.raiseRequest).toHaveBeenCalledWith(
        companyId,
        'contact-uuid-9',
        'agent-uuid-1',
        leadSource,
        null,
      );
      expect(accessRequests.grantLink).not.toHaveBeenCalled();
    });

    it('presents every lead contact of a page in one presenter call', async () => {
      const a = { ...mockLead, id: 'l1', contact: { id: 'c1' } } as Lead;
      const b = { ...mockLead, id: 'l2', contact: { id: 'c1' } } as Lead;
      const c = { ...mockLead, id: 'l3', contact: null } as Lead;
      leadRepo.findAndCount.mockResolvedValue([[a, b, c], 3]);
      const viewer = { userId: 'agent-uuid-1', ...agentCaller };

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        viewer,
      );

      expect(privacy.presentMany).toHaveBeenCalledTimes(1);
      expect(privacy.presentMany).toHaveBeenCalledWith(companyId, viewer, [
        { id: 'c1' },
      ]);
      expect(result.data.map((l) => l.contact)).toEqual([
        { id: 'c1' },
        { id: 'c1' },
        null,
      ]);
    });

    it('caps the leads page at 100 rows', async () => {
      leadRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll(companyId, 2, 500);

      expect(leadRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 100 }),
      );
      expect(result.limit).toBe(100);
    });
  });
});
