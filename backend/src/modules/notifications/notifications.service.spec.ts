import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationChannel, NotificationStatus } from './dto/send-notification.dto';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: jest.Mocked<Repository<Notification>>;

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

    const module: TestingModule = await Test.createTestingModule({
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
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repo = module.get(getRepositoryToken(Notification));
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
      expect(result).toEqual(mockNotification);
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

      const result = await service.markAsRead('notif-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'notif-uuid-1', companyId },
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when notification not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('notif-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
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
});
