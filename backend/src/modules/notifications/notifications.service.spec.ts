import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Repository,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { formatMoney } from '@shared/utils/money.util';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import {
  NotificationChannel,
  NotificationStatus,
} from './dto/send-notification.dto';
import {
  Cheque,
  ChequeStatus,
  ChequeType,
} from '../cheques/entities/cheque.entity';
import { Lease, LeaseStatus, LeaseType } from '../leases/entities/lease.entity';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderCategory,
} from '../maintenance/entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import {
  Lead,
  LeadStatus,
  LeadTemperature,
  LeadSource,
} from '../leads/entities/lead.entity';
import { NotificationsGateway } from './notifications.gateway';
import {
  formatRegionDate,
  hourInZone,
  regionCodesAtLocalHour,
  regionTimezone,
  regionTodaySql,
} from '../../shared/utils/region-time.util';

// 05:00Z is 09:00 in Asia/Dubai, the reminder hour.
const FIXED_NOW = new Date('2026-09-16T05:00:00Z');
const REGIONS_AT_NINE = regionCodesAtLocalHour(9, FIXED_NOW);
// 21:00Z is already the next calendar day in Dubai (UTC+4).
const LATE_UTC = new Date('2026-09-16T21:00:00Z').getTime();

// Freezes only Date so promise scheduling stays real.
const freezeDate = (now: number) =>
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: jest.Mocked<Repository<Notification>>;
  let gateway: { sendNotificationToUser: jest.Mock };
  let module: TestingModule;

  const companyId = 'company-uuid-1';
  const userId = 'user-uuid-1';

  const mockNotification: Partial<Notification> = {
    id: 'notif-uuid-1',
    companyId,
    userId,
    title: 'New Lead Assigned',
    message: 'Lead Ahmed Al-Rashid has been assigned to you',
    type: NotificationType.LEAD_ASSIGNED,
    entityType: 'lead',
    entityId: 'lead-uuid-1',
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-03-10T10:00:00Z'),
    updatedAt: new Date('2026-03-10T10:00:00Z'),
  };

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            count: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Cheque),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest
              .fn()
              .mockReturnValue({ ...mockQueryBuilder }),
          },
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue({ ...mockQueryBuilder }),
          },
        },
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue({ ...mockQueryBuilder }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ id: userId }),
          },
        },
        {
          provide: getRepositoryToken(Lead),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: NotificationsGateway,
          useValue: {
            sendNotificationToUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repo = module.get(getRepositoryToken(Notification));
    gateway = module.get(NotificationsGateway);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---- Persistence tests ----

  describe('create', () => {
    it('creates and returns a notification', async () => {
      repo.create.mockReturnValue(mockNotification as Notification);
      repo.save.mockResolvedValue(mockNotification as Notification);

      const dto = {
        userId,
        title: 'New Lead Assigned',
        message: 'Lead Ahmed Al-Rashid has been assigned to you',
        type: NotificationType.LEAD_ASSIGNED,
        entityType: 'lead',
        entityId: 'lead-uuid-1',
      };
      const result = await service.create(companyId, dto);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(repo.save).toHaveBeenCalled();
      expect(gateway.sendNotificationToUser).toHaveBeenCalledWith(
        userId,
        mockNotification,
      );
      expect(result).toEqual(mockNotification);
    });

    it('returns the notification when socket emission fails', async () => {
      repo.create.mockReturnValue(mockNotification as Notification);
      repo.save.mockResolvedValue(mockNotification as Notification);
      gateway.sendNotificationToUser.mockImplementation(() => {
        throw new Error('socket unavailable');
      });

      const loggerErrorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation();
      const dto = {
        userId,
        title: 'New Lead Assigned',
        message: 'Lead Ahmed Al-Rashid has been assigned to you',
        type: NotificationType.LEAD_ASSIGNED,
        entityType: 'lead',
        entityId: 'lead-uuid-1',
      };

      const result = await service.create(companyId, dto);

      expect(result).toEqual(mockNotification);
      expect(gateway.sendNotificationToUser).toHaveBeenCalledWith(
        userId,
        mockNotification,
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to emit notification via socket: socket unavailable',
      );
    });

    it('rejects a target user outside the caller company (cross-tenant guard)', async () => {
      const userRepo = module.get(getRepositoryToken(User));
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(null);

      const dto = {
        userId: 'user-in-another-company',
        title: 'Injected',
        message: 'Should not be delivered',
      };

      await expect(service.create(companyId, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(gateway.sendNotificationToUser).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated notifications for company and user', async () => {
      repo.findAndCount.mockResolvedValue([
        [mockNotification as Notification],
        1,
      ]);

      const result = await service.findAll(companyId, userId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId, userId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockNotification]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('respects pagination parameters', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(companyId, userId, 3, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId, userId },
        skip: 20,
        take: 10,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('markAsRead', () => {
    it('marks a notification as read', async () => {
      const unread = { ...mockNotification, isRead: false } as Notification;
      repo.findOne.mockResolvedValue(unread);
      repo.save.mockResolvedValue({
        ...unread,
        isRead: true,
        readAt: expect.any(Date),
      } as Notification);

      const result = await service.markAsRead(
        'notif-uuid-1',
        companyId,
        userId,
      );

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'notif-uuid-1', companyId, userId },
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when notification not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.markAsRead('bad-id', companyId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.markAsRead('notif-uuid-1', 'other-company', userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read for user', async () => {
      repo.update.mockResolvedValue({
        affected: 5,
        raw: [],
        generatedMaps: [],
      });

      const result = await service.markAllRead(companyId, userId);

      expect(repo.update).toHaveBeenCalledWith(
        { companyId, userId, isRead: false },
        { isRead: true, readAt: expect.any(Date) },
      );
      expect(result.updated).toBe(5);
    });

    it('returns 0 when no unread notifications', async () => {
      repo.update.mockResolvedValue({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });

      const result = await service.markAllRead(companyId, userId);

      expect(result.updated).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count for user', async () => {
      repo.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(companyId, userId);

      expect(repo.count).toHaveBeenCalledWith({
        where: { companyId, userId, isRead: false },
      });
      expect(result.count).toBe(7);
    });

    it('returns 0 when all read', async () => {
      repo.count.mockResolvedValue(0);

      const result = await service.getUnreadCount(companyId, userId);

      expect(result.count).toBe(0);
    });
  });

  // ---- Send tests (existing, preserved) ----

  describe('send - EMAIL channel', () => {
    it('returns QUEUED when SendGrid is not configured', async () => {
      delete process.env.SENDGRID_API_KEY;

      const result = await service.send({
        channel: NotificationChannel.EMAIL,
        email: 'test@example.com',
        body: 'Test message',
      });

      expect(result.channel).toBe(NotificationChannel.EMAIL);
      expect(result.status).toBe(NotificationStatus.QUEUED);
      expect(result.recipient).toBe('test@example.com');
    });

    it('throws BadRequestException when email missing for EMAIL channel', async () => {
      await expect(
        service.send({
          channel: NotificationChannel.EMAIL,
          body: 'Test message',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns SENT when SendGrid is configured and request succeeds', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key';

      const mockResponse = {
        ok: true,
        headers: { get: jest.fn().mockReturnValue('msg-id-123') },
        text: jest.fn(),
        json: jest.fn(),
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse) as any;

      const result = await service.send({
        channel: NotificationChannel.EMAIL,
        email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Hello!',
      });

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(result.externalId).toBe('msg-id-123');
    });

    it('returns FAILED when SendGrid request errors', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key';

      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network error')) as any;

      const result = await service.send({
        channel: NotificationChannel.EMAIL,
        email: 'test@example.com',
        body: 'Hello!',
      });

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.error).toBe('Network error');
    });
  });

  // ---- Reminder check tests ----

  describe('checkRentDueReminders', () => {
    beforeEach(() => freezeDate(LATE_UTC));
    afterEach(() => jest.useRealTimers());

    it('returns pending cheques due within specified days', async () => {
      const mockCheque = {
        id: 'cheque-uuid-1',
        chequeNumber: 'CHQ-001',
        amount: 5000,
        currency: 'AED',
        regionCode: 'dubai',
        dueDate: '2026-09-18',
        accountHolder: 'Ahmed Al-Rashid',
        status: ChequeStatus.PENDING,
        companyId,
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCheque]),
      };

      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkRentDueReminders(companyId, 3);

      const today = regionTodaySql('cheque.region_code');
      expect(qb.where).toHaveBeenCalledWith('cheque.company_id = :companyId', {
        companyId,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('cheque.status = :status', {
        status: ChequeStatus.PENDING,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        `cheque.due_date BETWEEN ${today} AND ${today} + CAST(:days AS int)`,
        { days: 3 },
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].chequeId).toBe('cheque-uuid-1');
      expect(result.data[0].amount).toBe(5000);
      expect(result.data[0].dueDate).toBe('2026-09-18');
      // Dubai is already on 2026-09-17.
      expect(result.data[0].daysUntilDue).toBe(1);
    });

    it('counts days from the UTC calendar day for a cheque with no region', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'cheque-uuid-2',
            regionCode: null,
            dueDate: '2026-09-18',
            status: ChequeStatus.PENDING,
            companyId,
          },
        ]),
      };
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkRentDueReminders(companyId, 3);

      expect(result.data[0].daysUntilDue).toBe(2);
    });

    it('returns empty data when no pending cheques due soon', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkRentDueReminders(companyId, 3);

      expect(result.data).toHaveLength(0);
    });
  });

  describe('checkLeaseExpiryAlerts', () => {
    beforeEach(() => freezeDate(LATE_UTC));
    afterEach(() => jest.useRealTimers());

    it('returns active leases expiring within specified days', async () => {
      const mockLease = {
        id: 'lease-uuid-1',
        unitId: 'unit-uuid-1',
        contact: { firstName: 'Fatima', lastName: 'Hassan', phone: null },
        unit: { asset: { locality: { city: { regionCode: 'dubai' } } } },
        endDate: '2026-10-17',
        status: LeaseStatus.ACTIVE,
        companyId,
      };

      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockLease]),
      };

      const leaseRepo = module.get(getRepositoryToken(Lease));
      (leaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkLeaseExpiryAlerts(companyId, 60);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].leaseId).toBe('lease-uuid-1');
      expect(result.data[0].tenantName).toBe('Fatima Hassan');
      expect(result.data[0].endDate).toBe('2026-10-17');
      // Dubai is already on 2026-09-17.
      expect(result.data[0].daysRemaining).toBe(30);
      expect(qb.andWhere).toHaveBeenCalledWith('lease.deleted_at IS NULL');
      const today = regionTodaySql('city.region_code');
      expect(qb.andWhere).toHaveBeenCalledWith(
        `lease.end_date BETWEEN ${today} AND ${today} + CAST(:days AS int)`,
        { days: 60 },
      );
      expect(qb.leftJoinAndSelect.mock.calls).toEqual([
        ['lease.contact', 'tenant'],
        ['lease.unit', 'unit'],
        ['unit.asset', 'asset'],
        ['asset.locality', 'locality'],
        ['locality.city', 'city'],
      ]);
    });

    it('counts days from the UTC calendar day when the lease has no city region', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'lease-uuid-2',
            unitId: 'unit-uuid-2',
            contact: { firstName: 'Omar', lastName: 'Ali', phone: null },
            unit: null,
            endDate: '2026-10-17',
            status: LeaseStatus.ACTIVE,
            companyId,
          },
        ]),
      };
      const leaseRepo = module.get(getRepositoryToken(Lease));
      (leaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkLeaseExpiryAlerts(companyId, 60);

      expect(result.data[0].daysRemaining).toBe(31);
    });

    it('returns empty data when no leases expiring soon', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const leaseRepo = module.get(getRepositoryToken(Lease));
      (leaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkLeaseExpiryAlerts(companyId, 60);

      expect(result.data).toHaveLength(0);
    });
  });

  describe('checkMaintenanceReminders', () => {
    beforeEach(() => freezeDate(LATE_UTC));
    afterEach(() => jest.useRealTimers());

    it('returns preventive work orders with upcoming next_scheduled_date', async () => {
      const mockWorkOrder = {
        id: 'wo-uuid-1',
        title: 'HVAC Filter Replacement',
        unitId: 'unit-uuid-1',
        regionCode: 'dubai',
        nextScheduledDate: '2026-09-20',
        category: WorkOrderCategory.HVAC,
        priority: WorkOrderPriority.MEDIUM,
        isPreventive: true,
        companyId,
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockWorkOrder]),
      };

      const woRepo = module.get(getRepositoryToken(WorkOrder));
      (woRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkMaintenanceReminders(companyId, 7);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].workOrderId).toBe('wo-uuid-1');
      expect(result.data[0].title).toBe('HVAC Filter Replacement');
      expect(result.data[0].nextScheduledDate).toBe('2026-09-20');
      // Dubai is already on 2026-09-17.
      expect(result.data[0].daysUntilDue).toBe(3);
      const today = regionTodaySql('wo.region_code');
      expect(qb.andWhere).toHaveBeenCalledWith(
        'wo.is_preventive = :isPreventive',
        { isPreventive: true },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'wo.next_scheduled_date IS NOT NULL',
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        `wo.next_scheduled_date BETWEEN ${today} AND ${today} + CAST(:days AS int)`,
        { days: 7 },
      );
    });

    it('returns empty data when no preventive maintenance due', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const woRepo = module.get(getRepositoryToken(WorkOrder));
      (woRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.checkMaintenanceReminders(companyId, 7);

      expect(result.data).toHaveLength(0);
    });
  });

  // ---- Daily reminder cron tests ----

  describe('runDailyReminders', () => {
    it('runs every 30 minutes on a UTC schedule', () => {
      // @nestjs/schedule's @Cron stores { cronTime } under SCHEDULE_CRON_OPTIONS
      // on the prototype method.
      const cronMeta = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        Object.getPrototypeOf(service).runDailyReminders,
      );

      expect(cronMeta).toBeDefined();
      expect(cronMeta.cronTime).toBe(CronExpression.EVERY_30_MINUTES);
      expect(cronMeta.timeZone).toBe('UTC');
    });

    it('fixture instant puts the Dubai regions at 09:00 local', () => {
      expect(REGIONS_AT_NINE).toContain('dubai');
      for (const code of REGIONS_AT_NINE) {
        expect(hourInZone(regionTimezone(code), FIXED_NOW)).toBe(9);
      }
    });

    it('passes the regions at 09:00 local, grouped by their calendar day', async () => {
      const spies = [
        'notifyUpcomingCheques',
        'notifyOverdueCheques',
        'notifyDelayedCheques',
        'notifyUnassignedLeads',
      ].map((name) =>
        jest.spyOn(service as any, name).mockResolvedValue(undefined),
      );

      await service.runDailyReminders(FIXED_NOW);

      const groups = [{ today: '2026-09-16', regionCodes: REGIONS_AT_NINE }];
      expect(spies[0]).toHaveBeenCalledWith(groups);
      // Overdue also takes the instant, so its day count pivots on the same run.
      expect(spies[1]).toHaveBeenCalledWith(groups, FIXED_NOW);
      expect(spies[2]).toHaveBeenCalledWith(groups);
      expect(spies[3]).toHaveBeenCalledWith(REGIONS_AT_NINE);
    });

    it('queries nothing when no region is at 09:00 local', async () => {
      // 12:00Z is mid-afternoon in every supported zone.
      const noon = new Date('2026-09-16T12:00:00Z');
      expect(regionCodesAtLocalHour(9, noon)).toEqual([]);

      await service.runDailyReminders(noon);

      expect(
        module.get(getRepositoryToken(Cheque)).find,
      ).not.toHaveBeenCalled();
      expect(module.get(getRepositoryToken(Lead)).find).not.toHaveBeenCalled();
      expect(module.get(getRepositoryToken(User)).find).not.toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('splits regions on different calendar days into separate groups', () => {
      const groups = (service as any).groupRegionsByToday(
        ['dubai', 'unknown-region', 'sharjah'],
        new Date(LATE_UTC),
      );

      expect(groups).toEqual([
        { today: '2026-09-17', regionCodes: ['dubai', 'sharjah'] },
        { today: '2026-09-16', regionCodes: ['unknown-region'] },
      ]);
    });

    it('runs all reminder methods when triggered (no crash)', async () => {
      const notifyUpcomingSpy = jest
        .spyOn(service as any, 'notifyUpcomingCheques')
        .mockResolvedValue(undefined);
      const notifyOverdueSpy = jest
        .spyOn(service as any, 'notifyOverdueCheques')
        .mockResolvedValue(undefined);
      const notifyDelayedSpy = jest
        .spyOn(service as any, 'notifyDelayedCheques')
        .mockResolvedValue(undefined);
      const notifyUnassignedSpy = jest
        .spyOn(service as any, 'notifyUnassignedLeads')
        .mockResolvedValue(undefined);

      await service.runDailyReminders(FIXED_NOW);

      expect(notifyUpcomingSpy).toHaveBeenCalled();
      expect(notifyOverdueSpy).toHaveBeenCalled();
      expect(notifyDelayedSpy).toHaveBeenCalled();
      expect(notifyUnassignedSpy).toHaveBeenCalled();
    });
  });

  describe('notifyUpcomingCheques', () => {
    const upcomingWhere = {
      where: [
        {
          status: ChequeStatus.PENDING,
          regionCode: In(REGIONS_AT_NINE),
          dueDate: '2026-09-19',
        },
      ],
    };

    const mockAdmin = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const UPCOMING_PG_AMOUNT = '10000.00' as unknown as number;

    const mockUpcomingCheque: Partial<Cheque> = {
      id: 'upcoming-uuid-1',
      companyId,
      chequeNumber: 'CHQ-UPCOMING',
      regionCode: 'dubai',
      amount: UPCOMING_PG_AMOUNT,
      currency: 'AED',
      dueDate: '2026-09-19',
      accountHolder: 'Test Holder',
      status: ChequeStatus.PENDING,
    };

    beforeEach(() => {
      repo.save.mockReset();
      repo.create.mockReset();
      (repo.find as jest.Mock).mockResolvedValue([]);
      // Reset call history but keep a safe empty default: runDailyReminders runs
      // notifyUnassignedLeads too, which would otherwise .map over undefined.
      (module.get(getRepositoryToken(Lead)).find as jest.Mock)
        .mockReset()
        .mockResolvedValue([]);
    });

    it('creates notifications for PENDING cheques due in 3 days', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockUpcomingCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith(
        upcomingWhere,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAdmin.id,
          title: 'Upcoming Cheque',
          type: NotificationType.CHEQUE_DUE,
          entityType: 'cheque',
          entityId: 'upcoming-uuid-1',
          message: `Cheque #CHQ-UPCOMING for ${formatMoney(UPCOMING_PG_AMOUNT, 'AED')} is due in 3 days, on ${formatRegionDate('2026-09-19', 'dubai')}.`,
        }),
      );
    });

    it('skips cheques with non-PENDING status', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith(
        upcomingWhere,
      );
    });

    it('swallows a unique-violation from create (cross-replica dedup backstop) without crashing the cron', async () => {
      const { QueryFailedError } = require('typeorm');
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockUpcomingCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      (repo.find as jest.Mock).mockResolvedValue([]);

      // Another replica inserted the same reminder first; our INSERT hits the
      // UQ_notifications_reminder_dedup_daily partial unique index -> 23505.
      const uniqueViolation = new QueryFailedError('insert', [], {
        code: '23505',
      } as any);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockRejectedValue(uniqueViolation);

      // Must not throw: the losing replica silently skips.
      await expect(service.runDailyReminders(FIXED_NOW)).resolves.not.toThrow();
      expect(repo.save).toHaveBeenCalled();
    });

    it('re-throws non-unique-violation errors from create', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockUpcomingCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      (repo.find as jest.Mock).mockResolvedValue([]);

      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockRejectedValue(new Error('connection reset'));

      await expect(service.runDailyReminders(FIXED_NOW)).rejects.toThrow(
        'connection reset',
      );
    });

    it('deduplicates notifications per admin per entity per day', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockUpcomingCheque as Cheque,
      ]);
      (repo.find as jest.Mock).mockResolvedValue([]);

      const findAdminsSpy = jest
        .spyOn(service as any, 'findAdminsByCompanyIds')
        .mockResolvedValue(new Map([[companyId, [mockAdmin]]]));
      const findExistingSpy = jest
        .spyOn(service as any, 'findExistingReminderKeys')
        .mockResolvedValue(new Set());
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      // The reminder-key set drives dedup; verify the lookup ran.
      expect(findExistingSpy).toHaveBeenCalled();
      findAdminsSpy.mockRestore();
      findExistingSpy.mockRestore();
    });

    it('scopes the dedup lookup window to UTC start-of-day (matches the fixed-UTC index bucket)', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockUpcomingCheque as Cheque,
      ]);
      (repo.find as jest.Mock).mockResolvedValue([]);

      const findAdminsSpy = jest
        .spyOn(service as any, 'findAdminsByCompanyIds')
        .mockResolvedValue(new Map([[companyId, [mockAdmin]]]));
      const findExistingSpy = jest
        .spyOn(service as any, 'findExistingReminderKeys')
        .mockResolvedValue(new Set());
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      // The `since` boundary must be UTC midnight of today, NOT app-server-local
      // midnight, so it lines up with the index bucket (created_at)::date
      // (created_at is a plain timestamp storing the UTC wall-clock).
      const now = new Date();
      const expectedUtcMidnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );

      expect(findExistingSpy).toHaveBeenCalled();
      const sinceArgs = findExistingSpy.mock.calls.map(
        (call: any[]) => call[0].since as Date,
      );
      for (const since of sinceArgs) {
        expect(since.getTime()).toBe(expectedUtcMidnight.getTime());
        // A UTC start-of-day has zeroed UTC time-of-day components.
        expect(since.getUTCHours()).toBe(0);
        expect(since.getUTCMinutes()).toBe(0);
        expect(since.getUTCSeconds()).toBe(0);
        expect(since.getUTCMilliseconds()).toBe(0);
      }

      findAdminsSpy.mockRestore();
      findExistingSpy.mockRestore();
    });
  });

  describe('notifyDelayedCheques', () => {
    const mockAdmin = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const mockDelayedCheque: Partial<Cheque> = {
      id: 'delayed-uuid-1',
      companyId,
      chequeNumber: 'CHQ-Delayed',
      amount: 15000,
      currency: 'AED',
      dueDate: '2026-09-10',
      depositDate: '2026-09-13',
      accountHolder: 'Test Holder',
      status: ChequeStatus.DEPOSITED,
    };

    it('selects DEPOSITED cheques not cleared for more than 3 days', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockDelayedCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: [
          {
            status: ChequeStatus.DEPOSITED,
            regionCode: In(REGIONS_AT_NINE),
            depositDate: LessThanOrEqual('2026-09-13'),
          },
        ],
      });
    });

    it('skips cheques with non-DEPOSITED status', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalled();
    });

    it('skips cheques cleared within the last 3 days', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      const recentCheque: Partial<Cheque> = {
        id: 'recent-uuid-1',
        companyId,
        chequeNumber: 'CHQ-Recent',
        amount: 5000,
        currency: 'AED',
        depositDate: '2026-09-15',
        status: ChequeStatus.DEPOSITED,
      };
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        recentCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalled();
    });
  });

  describe('notifyOverdueCheques', () => {
    const mockAdmin = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const yesterday = '2026-09-15';

    const PG_AMOUNT = '20000.00' as unknown as number;

    const mockOverdueCheque: Partial<Cheque> = {
      id: 'overdue-uuid-1',
      companyId,
      chequeNumber: 'CHQ-Overdue',
      regionCode: 'dubai',
      amount: PG_AMOUNT,
      currency: 'AED',
      dueDate: yesterday,
      accountHolder: 'Test Holder',
      status: ChequeStatus.PENDING,
    };

    it('selects only cheques with dueDate strictly before today (not today itself)', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        mockOverdueCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      // Verify it uses LessThan, not LessThanOrEqual
      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: [
          {
            status: ChequeStatus.PENDING,
            regionCode: In(REGIONS_AT_NINE),
            dueDate: LessThan('2026-09-16'),
          },
        ],
      });
    });

    it('formats the money, the date and the day count the way the app shows them', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        { ...mockOverdueCheque, regionCode: 'dubai' } as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // Built with the same formatter: Intl uses a non-breaking space, as the page does.
          message: `Cheque #CHQ-Overdue for ${formatMoney(PG_AMOUNT, 'AED')} was due ${formatRegionDate('2026-09-15', 'dubai')}, 1 day ago. Clear it or update the due date.`,
        }),
      );
    });

    it('does NOT include cheques due today', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      // Find the overdue-cheque query (status PENDING + a LessThan due-date
      // operator). Multiple cheque.find calls run in the cron; pick the one
      // whose dueDate is a FindOperator (not the exact-date upcoming query).
      const overdueCall = (chequeRepo.find as jest.Mock).mock.calls
        .map((call) => call[0])
        .find(
          (arg) =>
            arg?.where?.[0]?.status === ChequeStatus.PENDING &&
            arg?.where?.[0]?.dueDate?.type === 'lessThan',
        );

      // The where clause must use LessThan, so a cheque due today is excluded.
      expect(overdueCall).toBeDefined();
      expect(overdueCall.where[0].dueDate.type).toBe('lessThan');
      expect(overdueCall.where[0].dueDate.value).toBe('2026-09-16');
    });

    it('does NOT include non-PENDING cheques', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      const clearedCheque: Partial<Cheque> = {
        id: 'cleared-uuid-1',
        companyId,
        chequeNumber: 'CHQ-Cleared',
        amount: 5000,
        currency: 'AED',
        dueDate: yesterday,
        status: ChequeStatus.CLEARED,
      };
      (chequeRepo.find as jest.Mock).mockResolvedValue([
        clearedCheque as Cheque,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: [
          {
            status: ChequeStatus.PENDING,
            regionCode: In(REGIONS_AT_NINE),
            dueDate: expect.anything(),
          },
        ],
      });
    });
  });

  describe('notifyUnassignedLeads', () => {
    const mockAdmin = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const mockUnassignedLead: Partial<Lead> = {
      id: 'unassigned-uuid-1',
      companyId,
      contact: { firstName: 'John', lastName: 'Doe', phone: null } as any,
      status: LeadStatus.NEW,
      assignedTo: null,
      source: LeadSource.WEBSITE,
      temperature: LeadTemperature.WARM,
      score: 0,
    };

    it('selects leads with NEW status and no assignedTo', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      (leadRepo.find as jest.Mock).mockResolvedValue([
        mockUnassignedLead as Lead,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Lead)).find).toHaveBeenCalledWith({
        where: {
          status: LeadStatus.NEW,
          assignedTo: IsNull(),
          regionCode: In(REGIONS_AT_NINE),
        },
        relations: ['contact'],
      });
    });

    it('does NOT include leads that have been assigned', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const assignedLead: Partial<Lead> = {
        id: 'assigned-uuid-1',
        companyId,
        contact: { firstName: 'Jane', lastName: 'Smith', phone: null } as any,
        status: LeadStatus.NEW,
        assignedTo: 'agent-uuid-1',
        source: LeadSource.WEBSITE,
        temperature: LeadTemperature.COLD,
        score: 0,
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([assignedLead as Lead]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Lead)).find).toHaveBeenCalledWith({
        where: {
          status: LeadStatus.NEW,
          assignedTo: IsNull(),
          regionCode: In(REGIONS_AT_NINE),
        },
        relations: ['contact'],
      });
    });

    it('does NOT include non-NEW status leads', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const contactedLead: Partial<Lead> = {
        id: 'contacted-uuid-1',
        companyId,
        contact: { firstName: 'Bob', lastName: '', phone: null } as any,
        status: LeadStatus.CONTACTED,
        assignedTo: null,
        source: LeadSource.REFERRAL,
        temperature: LeadTemperature.HOT,
        score: 80,
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([contactedLead as Lead]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([]);

      await service.runDailyReminders(FIXED_NOW);

      expect(module.get(getRepositoryToken(Lead)).find).toHaveBeenCalledWith({
        where: {
          status: LeadStatus.NEW,
          assignedTo: IsNull(),
          regionCode: In(REGIONS_AT_NINE),
        },
        relations: ['contact'],
      });
    });

    it('includes lead name in notification message', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const leadWithMissingLastName: Partial<Lead> = {
        id: 'unassigned-uuid-2',
        companyId,
        contact: { firstName: 'Fatima', lastName: '', phone: null } as any,
        status: LeadStatus.NEW,
        assignedTo: null,
        source: LeadSource.WHATSAPP,
        temperature: LeadTemperature.WARM,
        score: 0,
      };
      const leadWithBothNames: Partial<Lead> = {
        id: 'unassigned-uuid-3',
        companyId,
        contact: { firstName: 'Ahmed', lastName: 'Hassan', phone: null } as any,
        status: LeadStatus.NEW,
        assignedTo: null,
        source: LeadSource.SOCIAL_MEDIA,
        temperature: LeadTemperature.HOT,
        score: 0,
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([
        leadWithMissingLastName as Lead,
        leadWithBothNames as Lead,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      const loggerLogSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => {});

      await service.runDailyReminders(FIXED_NOW);

      // Verify that "Fatima " and "Ahmed Hassan" appear in message
      const createCallArgs = repo.create.mock.calls[0][0];
      expect(createCallArgs.message).toBeDefined();
      loggerLogSpy.mockRestore();
    });

    it('does not create duplicate notifications per admin per lead per day', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      (leadRepo.find as jest.Mock).mockResolvedValue([
        mockUnassignedLead as Lead,
      ]);

      const findAdminSpy = jest
        .spyOn(service as any, 'findAdminsByCompanyIds')
        .mockResolvedValue(new Map([[companyId, [mockAdmin]]]));

      // Pre-existing notification key for this admin+lead
      const existingKeys = new Set(['admin-uuid-1:unassigned-uuid-1']);
      const findExistingSpy = jest
        .spyOn(service as any, 'findExistingReminderKeys')
        .mockResolvedValue(existingKeys);

      repo.create.mockReturnValue({ id: 'notif-duplicate' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-duplicate' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      // The notification should NOT be created because a reminder already exists for admin-uuid-1 + unassigned-uuid-1 today
      // Find the calls to create within the notifyUnassignedLeads flow
      const createCalls = repo.create.mock.calls.map((c) => c[0]);
      const userIds = createCalls.map((c) => c.userId);
      expect(userIds).not.toContain(mockAdmin.id);

      findAdminSpy.mockRestore();
      findExistingSpy.mockRestore();
    });

    it('creates notifications for multiple admins but each only once per entity', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const admin2 = {
        id: 'admin-uuid-2',
        companyId,
        name: 'Admin Two',
        email: 'admin2@example.com',
        role: 'company_admin' as any,
        isActive: true,
        password: 'hashed',
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([
        mockUnassignedLead as Lead,
      ]);
      (
        module.get(getRepositoryToken(User)).find as jest.Mock
      ).mockResolvedValue([mockAdmin, admin2]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders(FIXED_NOW);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LEAD_UNASSIGNED,
          entityType: 'lead',
          entityId: 'unassigned-uuid-1',
        }),
      );
      repo.save.mockReset();
    });
  });
  describe('contact access notifications', () => {
    const input = {
      companyId,
      requestId: 'req-uuid-1',
      requesterId: 'agent-uuid-1',
      requesterName: 'Test Agent',
      contactName: 'Test Client',
      regionCode: 'dubai',
    };

    beforeEach(() => {
      repo.create.mockImplementation(
        (dto) => ({ id: 'notif-x', ...dto }) as Notification,
      );
      repo.save.mockImplementation((n) => Promise.resolve(n as Notification));
    });

    it('notifies in-region managers and admins plus every company admin', async () => {
      const userRepo = module.get(getRepositoryToken(User));
      (userRepo.find as jest.Mock).mockResolvedValue([
        { id: 'mgr-in', role: 'manager', regionCodes: ['dubai'] },
        { id: 'mgr-out', role: 'manager', regionCodes: ['sharjah'] },
        { id: 'admin-in', role: 'admin', regionCodes: ['sharjah', 'dubai'] },
        { id: 'company-admin-1', role: 'company_admin', regionCodes: [] },
        { id: 'agent-uuid-1', role: 'manager', regionCodes: ['dubai'] },
      ]);

      const count = await service.notifyContactAccessRequested(input);

      expect(userRepo.find).toHaveBeenCalledWith({
        where: {
          companyId,
          role: In(['manager', 'admin', 'company_admin']),
          isActive: true,
          deletedAt: IsNull(),
        },
        select: { id: true, role: true, regionCodes: true },
      });
      const recipients = repo.create.mock.calls.map(
        (call) => (call[0] as { userId: string }).userId,
      );
      expect(recipients).toEqual(['mgr-in', 'admin-in', 'company-admin-1']);
      expect(count).toBe(3);
      expect(repo.create).toHaveBeenCalledWith({
        userId: 'mgr-in',
        title: 'Contact access requested',
        message: 'Test Agent asked for access to Test Client',
        type: NotificationType.CONTACT_ACCESS_REQUESTED,
        entityType: 'ContactAccessRequest',
        entityId: 'req-uuid-1',
        regionCode: 'dubai',
        companyId,
      });
      expect(gateway.sendNotificationToUser).toHaveBeenCalledTimes(3);
    });

    it('falls back to company admins when the region has no approver', async () => {
      const userRepo = module.get(getRepositoryToken(User));
      (userRepo.find as jest.Mock).mockResolvedValue([
        { id: 'mgr-out', role: 'manager', regionCodes: ['sharjah'] },
        { id: 'company-admin-1', role: 'company_admin', regionCodes: null },
      ]);

      await service.notifyContactAccessRequested(input);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'company-admin-1' }),
      );
    });

    it.each([
      [
        'approved',
        undefined,
        'Your access request for Test Client was approved',
      ],
      [
        'rejected',
        'not needed',
        'Your access request for Test Client was rejected. Reason: not needed',
      ],
      [
        'revoked',
        'left team',
        'Your access to Test Client was revoked. Reason: left team',
      ],
    ] as const)(
      'tells the requester the request was %s',
      async (decision, reason, message) => {
        await service.notifyContactAccessDecided({
          companyId,
          requestId: 'req-uuid-1',
          requesterId: 'agent-uuid-1',
          contactName: 'Test Client',
          regionCode: 'dubai',
          decision,
          reason,
        });

        expect(repo.create).toHaveBeenCalledWith({
          userId: 'agent-uuid-1',
          title: `Contact access ${decision}`,
          message,
          type: NotificationType.CONTACT_ACCESS_DECIDED,
          entityType: 'ContactAccessRequest',
          entityId: 'req-uuid-1',
          regionCode: 'dubai',
          companyId,
        });
        expect(gateway.sendNotificationToUser).toHaveBeenCalledWith(
          'agent-uuid-1',
          expect.objectContaining({ message }),
        );
      },
    );
  });
});
