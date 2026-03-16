import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { NotificationChannel, NotificationStatus } from './dto/send-notification.dto';
import { NotificationType } from './entities/notification.entity';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  const companyId = 'company-uuid-1';
  const userId = 'user-uuid-1';
  const mockReq = { user: { companyId, userId } };

  const mockNotification = {
    id: 'notif-uuid-1',
    companyId,
    userId,
    title: 'New Lead Assigned',
    message: 'Lead assigned to you',
    type: NotificationType.LEAD_ASSIGNED,
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSendResult = {
    channel: NotificationChannel.EMAIL,
    recipient: 'test@example.com',
    status: NotificationStatus.SENT,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            markAsRead: jest.fn(),
            markAllRead: jest.fn(),
            getUnreadCount: jest.fn(),
            send: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a notification for a user', async () => {
      service.create.mockResolvedValue(mockNotification as any);

      const dto = {
        userId,
        title: 'New Lead Assigned',
        message: 'Lead assigned to you',
        type: NotificationType.LEAD_ASSIGNED,
      };
      const result = await controller.create(dto, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockNotification);
    });
  });

  describe('findAll', () => {
    it('lists notifications for current user', async () => {
      const paginatedResult = {
        data: [mockNotification],
        total: 1,
        page: 1,
        limit: 20,
      };
      service.findAll.mockResolvedValue(paginatedResult as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, userId, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count for current user', async () => {
      service.getUnreadCount.mockResolvedValue({ count: 3 });

      const result = await controller.getUnreadCount(mockReq);

      expect(service.getUnreadCount).toHaveBeenCalledWith(companyId, userId);
      expect(result.count).toBe(3);
    });
  });

  describe('markAsRead', () => {
    it('marks a single notification as read', async () => {
      const readNotif = { ...mockNotification, isRead: true, readAt: new Date() };
      service.markAsRead.mockResolvedValue(readNotif as any);

      const result = await controller.markAsRead('notif-uuid-1', mockReq);

      expect(service.markAsRead).toHaveBeenCalledWith('notif-uuid-1', companyId, userId);
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('marks all notifications as read for current user', async () => {
      service.markAllRead.mockResolvedValue({ updated: 5 });

      const result = await controller.markAllRead(mockReq);

      expect(service.markAllRead).toHaveBeenCalledWith(companyId, userId);
      expect(result.updated).toBe(5);
    });
  });

  describe('send', () => {
    it('sends email notification', async () => {
      service.send.mockResolvedValue(mockSendResult);

      const dto = {
        channel: NotificationChannel.EMAIL,
        email: 'test@example.com',
        subject: 'Test',
        body: 'Hello!',
      };
      const result = await controller.send(dto as any);

      expect(service.send).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSendResult);
    });

    it('sends SMS notification', async () => {
      const smsResult = {
        channel: NotificationChannel.SMS,
        recipient: '+971501234567',
        status: NotificationStatus.SENT,
      };
      service.send.mockResolvedValue(smsResult);

      const dto = {
        channel: NotificationChannel.SMS,
        phone: '+971501234567',
        body: 'Your appointment is confirmed',
      };
      const result = await controller.send(dto as any);

      expect(service.send).toHaveBeenCalledWith(dto);
      expect(result).toEqual(smsResult);
    });
  });
});
