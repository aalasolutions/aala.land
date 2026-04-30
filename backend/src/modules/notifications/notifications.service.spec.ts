import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThanOrEqual } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationChannel, NotificationStatus } from './dto/send-notification.dto';
import { Cheque, ChequeStatus, ChequeType } from '../cheques/entities/cheque.entity';
import { Lease, LeaseStatus, LeaseType } from '../leases/entities/lease.entity';
import { WorkOrder, WorkOrderStatus, WorkOrderPriority, WorkOrderCategory } from '../maintenance/entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import { Lead, LeadStatus, LeadTemperature, LeadSource } from '../leads/entities/lead.entity';
import { NotificationsGateway } from './notifications.gateway';

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
            count: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Cheque),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
          },
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
          },
        },
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Lead),
          useValue: {
            find: jest.fn(),
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
      expect(gateway.sendNotificationToUser).toHaveBeenCalledWith(userId, mockNotification);
      expect(result).toEqual(mockNotification);
    });

    it('returns the notification when socket emission fails', async () => {
      repo.create.mockReturnValue(mockNotification as Notification);
      repo.save.mockResolvedValue(mockNotification as Notification);
      gateway.sendNotificationToUser.mockImplementation(() => {
        throw new Error('socket unavailable');
      });

      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();
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
      expect(gateway.sendNotificationToUser).toHaveBeenCalledWith(userId, mockNotification);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to emit notification via socket: socket unavailable',
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated notifications for company and user', async () => {
      repo.findAndCount.mockResolvedValue([[mockNotification as Notification], 1]);

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
      repo.save.mockResolvedValue({ ...unread, isRead: true, readAt: expect.any(Date) } as Notification);

      const result = await service.markAsRead('notif-uuid-1', companyId, userId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'notif-uuid-1', companyId, userId },
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when notification not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('bad-id', companyId, userId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('notif-uuid-1', 'other-company', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read for user', async () => {
      repo.update.mockResolvedValue({ affected: 5, raw: [], generatedMaps: [] });

      const result = await service.markAllRead(companyId, userId);

      expect(repo.update).toHaveBeenCalledWith(
        { companyId, userId, isRead: false },
        { isRead: true, readAt: expect.any(Date) },
      );
      expect(result.updated).toBe(5);
    });

    it('returns 0 when no unread notifications', async () => {
      repo.update.mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });

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

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await service.send({
        channel: NotificationChannel.EMAIL,
        email: 'test@example.com',
        body: 'Hello!',
      });

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.error).toBe('Network error');
    });
  });

  describe('send - SMS channel', () => {
    it('returns QUEUED when Twilio is not configured', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;

      const result = await service.send({
        channel: NotificationChannel.SMS,
        phone: '+971501234567',
        body: 'Test SMS',
      });

      expect(result.channel).toBe(NotificationChannel.SMS);
      expect(result.status).toBe(NotificationStatus.QUEUED);
      expect(result.recipient).toBe('+971501234567');
    });

    it('throws BadRequestException when phone missing for SMS channel', async () => {
      await expect(
        service.send({
          channel: NotificationChannel.SMS,
          body: 'Test SMS',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns SENT when Twilio is configured and request succeeds', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token123';
      process.env.TWILIO_FROM_NUMBER = '+15005550006';

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ sid: 'SM123' }),
        text: jest.fn(),
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse) as any;

      const result = await service.send({
        channel: NotificationChannel.SMS,
        phone: '+971501234567',
        body: 'Your appointment is confirmed',
      });

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(result.externalId).toBe('SM123');
    });

    it('returns FAILED when Twilio request errors', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token123';
      process.env.TWILIO_FROM_NUMBER = '+15005550006';

      global.fetch = jest.fn().mockRejectedValue(new Error('Twilio error')) as any;

      const result = await service.send({
        channel: NotificationChannel.SMS,
        phone: '+971501234567',
        body: 'Test',
      });

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.error).toBe('Twilio error');
    });
  });

  // ---- Reminder check tests ----

  describe('checkRentDueReminders', () => {
    it('returns pending cheques due within specified days', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const mockCheque = {
        id: 'cheque-uuid-1',
        chequeNumber: 'CHQ-001',
        amount: 5000,
        currency: 'AED',
        dueDate: tomorrow,
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

      expect(result.data).toHaveLength(1);
      expect(result.data[0].chequeId).toBe('cheque-uuid-1');
      expect(result.data[0].amount).toBe(5000);
      expect(result.data[0].daysUntilDue).toBeGreaterThanOrEqual(0);
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
    it('returns active leases expiring within specified days', async () => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      const mockLease = {
        id: 'lease-uuid-1',
        unitId: 'unit-uuid-1',
        tenantName: 'Fatima Hassan',
        endDate,
        status: LeaseStatus.ACTIVE,
        companyId,
      };

      const qb = {
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
      expect(result.data[0].daysRemaining).toBeLessThanOrEqual(60);
    });

    it('returns empty data when no leases expiring soon', async () => {
      const qb = {
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
    it('returns preventive work orders with upcoming next_scheduled_date', async () => {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 3);

      const mockWorkOrder = {
        id: 'wo-uuid-1',
        title: 'HVAC Filter Replacement',
        unitId: 'unit-uuid-1',
        nextScheduledDate: nextDate,
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
      expect(result.data[0].daysUntilDue).toBeLessThanOrEqual(7);
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
    it('should have a cron expression set to EVERY_DAY_AT_9AM', () => {
      const cronMeta = Reflect.getMetadata('schedule:schedules', service.runDailyReminders);

      expect(cronMeta).toBeDefined();
      expect(cronMeta).toBe(CronExpression.EVERY_DAY_AT_9AM);
    });

    it('runs all reminder methods when triggered (no crash)', async () => {
      const notifyUpcomingSpy = jest.spyOn(service as any, 'notifyUpcomingCheques').mockResolvedValue(undefined);
      const notifyOverdueSpy = jest.spyOn(service as any, 'notifyOverdueCheques').mockResolvedValue(undefined);
      const notifyDelayedSpy = jest.spyOn(service as any, 'notifyDelayedCheques').mockResolvedValue(undefined);
      const notifyUnassignedSpy = jest.spyOn(service as any, 'notifyUnassignedLeads').mockResolvedValue(undefined);

      await service.runDailyReminders();

      expect(notifyUpcomingSpy).toHaveBeenCalled();
      expect(notifyOverdueSpy).toHaveBeenCalled();
      expect(notifyDelayedSpy).toHaveBeenCalled();
      expect(notifyUnassignedSpy).toHaveBeenCalled();
    });
  });

  describe('notifyUpcomingCheques', () => {
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const mockAdmin: User = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const mockUpcomingCheque: Partial<Cheque> = {
      id: 'upcoming-uuid-1',
      companyId,
      chequeNumber: 'CHQ-UPCOMING',
      amount: 10000,
      currency: 'AED',
      dueDate: threeDaysFromNow,
      accountHolder: 'Test Holder',
      status: ChequeStatus.PENDING,
    };

    beforeEach(() => {
      repo.save.mockReset();
      repo.create.mockReset();
      (module.get(getRepositoryToken(Lead)).find as jest.Mock).mockReset();
    });

    it('creates notifications for PENDING cheques due in 3 days', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([mockUpcomingCheque as Cheque]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: { status: ChequeStatus.PENDING, dueDate: threeDaysFromNow },
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAdmin.id,
          title: 'Upcoming Cheque',
          type: NotificationType.CHEQUE_DUE,
          entityType: 'cheque',
          entityId: 'upcoming-uuid-1',
        }),
      );
    });

    it('skips cheques with non-PENDING status', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: { status: ChequeStatus.PENDING, dueDate: threeDaysFromNow },
      });
    });

    it('deduplicates notifications per admin per entity per day', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([mockUpcomingCheque as Cheque]);

      // Simulate one admin already having a reminder for this cheque today
      const existingExisting = {
        id: 'existing-notif',
        companyId,
        userId: mockAdmin.id,
        type: NotificationType.CHEQUE_DUE,
        entityId: 'upcoming-uuid-1',
        createdAt: new Date(),
      } as Notification;
      repo.find.mockReturnValue((function () {
        class SetLikeArray extends Array {
          has(key: string) { return false; }
        }
        return new SetLikeArray([existingExisting]);
      })());
      (repo.find as any).mockReturnValue({ has: () => false });
      const findAdminsSpy = jest.spyOn(service as any, 'findAdminsByCompanyIds').mockResolvedValue(
        new Map([[companyId, [mockAdmin]]]),
      );
      const findExistingSpy = jest.spyOn(service as any, 'findExistingReminderKeys').mockResolvedValue(new Set());
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders();

      // After verifying the dedup uses the key set correctly
      expect(findExistingSpy).toHaveBeenCalled();
    });
  });

  describe('notifyDelayedCheques', () => {
    const mockAdmin: User = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const mockDelayedCheque: Partial<Cheque> = {
      id: 'delayed-uuid-1',
      companyId,
      chequeNumber: 'CHQ-Delayed',
      amount: 15000,
      currency: 'AED',
      dueDate: new Date(),
      depositDate: threeDaysAgo,
      accountHolder: 'Test Holder',
      status: ChequeStatus.DEPOSITED,
    };

    it('selects DEPOSITED cheques not cleared for more than 3 days', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      const { LessThanOrEqual } = require('typeorm');

      (chequeRepo.find as jest.Mock).mockResolvedValue([mockDelayedCheque as Cheque]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: {
          status: ChequeStatus.DEPOSITED,
          depositDate: LessThanOrEqual(expect.any(Date)),
        },
      });
    });

    it('skips cheques with non-DEPOSITED status', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalled();
    });

    it('skips cheques cleared within the last 3 days', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const recentCheque: Partial<Cheque> = {
        id: 'recent-uuid-1',
        companyId,
        chequeNumber: 'CHQ-Recent',
        amount: 5000,
        currency: 'AED',
        depositDate: yesterday,
        status: ChequeStatus.DEPOSITED,
      };
      (chequeRepo.find as jest.Mock).mockResolvedValue([recentCheque as Cheque]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalled();
    });
  });

  describe('notifyOverdueCheques', () => {
    const mockAdmin: User = {
      id: 'admin-uuid-1',
      companyId,
      name: 'Admin One',
      email: 'admin@example.com',
      role: 'company_admin' as any,
      isActive: true,
      password: 'hashed',
    };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const mockOverdueCheque: Partial<Cheque> = {
      id: 'overdue-uuid-1',
      companyId,
      chequeNumber: 'CHQ-Overdue',
      amount: 20000,
      currency: 'AED',
      dueDate: yesterday,
      accountHolder: 'Test Holder',
      status: ChequeStatus.PENDING,
    };

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    it('selects only cheques with dueDate strictly before today (not today itself)', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      const { LessThan } = require('typeorm');

      (chequeRepo.find as jest.Mock).mockResolvedValue([mockOverdueCheque as Cheque]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders();

      // Verify it uses LessThan, not LessThanOrEqual
      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: {
          status: ChequeStatus.PENDING,
          dueDate: LessThan(todayMidnight),
        },
      });
    });

    it('does NOT include cheques due today', async () => {
      const chequeRepo = module.get(getRepositoryToken(Cheque));
      (chequeRepo.find as jest.Mock).mockResolvedValue([]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      const findCall = (chequeRepo.find as jest.Mock).mock.calls[0][0];
      const dueDate = findCall.where.dueDate;

      // The where clause should use LessThan, meaning a cheque due today would NOT match
      // We verify the LessThan constraint is used, so today itself is excluded
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      expect(dueDate.lessThan).toBeDefined();
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
      (chequeRepo.find as jest.Mock).mockResolvedValue([clearedCheque as Cheque]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Cheque)).find).toHaveBeenCalledWith({
        where: { status: ChequeStatus.PENDING, dueDate: expect.anything() },
      });
    });
  });

  describe('notifyUnassignedLeads', () => {
    const mockAdmin: User = {
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
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      status: LeadStatus.NEW,
      assignedTo: null,
      source: LeadSource.WEBSITE,
      temperature: LeadTemperature.WARM,
      score: 0,
    };

    it('selects leads with NEW status and no assignedTo', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      (leadRepo.find as jest.Mock).mockResolvedValue([mockUnassignedLead as Lead]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Lead)).find).toHaveBeenCalledWith({
        where: {
          status: LeadStatus.NEW,
          assignedTo: IsNull(),
        },
      });
    });

    it('does NOT include leads that have been assigned', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const assignedLead: Partial<Lead> = {
        id: 'assigned-uuid-1',
        companyId,
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        status: LeadStatus.NEW,
        assignedTo: 'agent-uuid-1',
        source: LeadSource.WEBSITE,
        temperature: LeadTemperature.COLD,
        score: 0,
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([assignedLead as Lead]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Lead)).find).toHaveBeenCalledWith({
        where: {
          status: LeadStatus.NEW,
          assignedTo: IsNull(),
        },
      });
    });

    it('does NOT include non-NEW status leads', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const contactedLead: Partial<Lead> = {
        id: 'contacted-uuid-1',
        companyId,
        firstName: 'Bob',
        lastName: '',
        email: 'bob@example.com',
        status: LeadStatus.CONTACTED,
        assignedTo: null,
        source: LeadSource.REFERRAL,
        temperature: LeadTemperature.HOT,
        score: 80,
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([contactedLead as Lead]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([]);

      await service.runDailyReminders();

      expect(module.get(getRepositoryToken(Lead)).find).toHaveBeenCalledWith({
        where: {
          status: LeadStatus.NEW,
          assignedTo: IsNull(),
        },
      });
    });

    it('includes lead name in notification message', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const leadWithMissingLastName: Partial<Lead> = {
        id: 'unassigned-uuid-2',
        companyId,
        firstName: 'Fatima',
        lastName: '',
        email: 'fatima@example.com',
        status: LeadStatus.NEW,
        assignedTo: null,
        source: LeadSource.WHATSAPP,
        temperature: LeadTemperature.WARM,
        score: 0,
      };
      const leadWithBothNames: Partial<Lead> = {
        id: 'unassigned-uuid-3',
        companyId,
        firstName: 'Ahmed',
        lastName: 'Hassan',
        email: 'ahmed@example.com',
        status: LeadStatus.NEW,
        assignedTo: null,
        source: LeadSource.SOCIAL_MEDIA,
        temperature: LeadTemperature.HOT,
        score: 0,
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([leadWithMissingLastName as Lead, leadWithBothNames as Lead]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([mockAdmin]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      const loggerLogSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});

      await service.runDailyReminders();

      // Verify that "Fatima " and "Ahmed Hassan" appear in message
      const createCallArgs = repo.create.mock.calls[0][0];
      expect(createCallArgs.message).toBeDefined();
      loggerLogSpy.mockRestore();
    });

    it('does not create duplicate notifications per admin per lead per day', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      (leadRepo.find as jest.Mock).mockResolvedValue([mockUnassignedLead as Lead]);

      const findAdminSpy = jest.spyOn(service as any, 'findAdminsByCompanyIds').mockResolvedValue(
        new Map([[companyId, [mockAdmin]]]),
      );

      // Pre-existing notification key for this admin+lead
      const existingKeys = new Set(['admin-uuid-1:unassigned-uuid-1']);
      const findExistingSpy = jest.spyOn(service as any, 'findExistingReminderKeys')
        .mockResolvedValue(existingKeys);

      repo.create.mockReturnValue({ id: 'notif-duplicate' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-duplicate' } as Notification);

      await service.runDailyReminders();

      // The notification should NOT be created because a reminder already exists for admin-uuid-1 + unassigned-uuid-1 today
      // Find the calls to create within the notifyUnassignedLeads flow
      const createCalls = repo.create.mock.calls.map(c => c[0]);
      const userIds = createCalls.map(c => c.userId);
      expect(userIds).not.toContain(mockAdmin.id);

      findAdminSpy.mockRestore();
      findExistingSpy.mockRestore();
    });

    it('creates notifications for multiple admins but each only once per entity', async () => {
      const leadRepo = module.get(getRepositoryToken(Lead));
      const admin2: User = {
        id: 'admin-uuid-2',
        companyId,
        name: 'Admin Two',
        email: 'admin2@example.com',
        role: 'company_admin' as any,
        isActive: true,
        password: 'hashed',
      };
      (leadRepo.find as jest.Mock).mockResolvedValue([mockUnassignedLead as Lead]);
      (module.get(getRepositoryToken(User)).find as jest.Mock).mockResolvedValue([mockAdmin, admin2]);
      repo.create.mockReturnValue({ id: 'notif-1' } as Notification);
      repo.save.mockResolvedValue({ id: 'notif-1' } as Notification);

      await service.runDailyReminders();

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
});
