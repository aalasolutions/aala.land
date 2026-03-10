import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SendNotificationDto, NotificationChannel, NotificationStatus } from './dto/send-notification.dto';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface NotificationResult {
  channel: NotificationChannel;
  recipient: string;
  status: NotificationStatus;
  externalId?: string;
  error?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  // ---- Persistence methods ----

  async create(companyId: string, dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({ ...dto, companyId });
    return this.notificationRepository.save(notification);
  }

  async findAll(
    companyId: string,
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.notificationRepository.findAndCount({
      where: { companyId, userId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async markAsRead(id: string, companyId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, companyId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllRead(companyId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { companyId, userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected || 0 };
  }

  async getUnreadCount(companyId: string, userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: { companyId, userId, isRead: false },
    });
    return { count };
  }

  // ---- Send methods (existing) ----

  async send(dto: SendNotificationDto): Promise<NotificationResult> {
    if (dto.channel === NotificationChannel.EMAIL) {
      return this.sendEmail(dto);
    }
    return this.sendSms(dto);
  }

  private async sendEmail(dto: SendNotificationDto): Promise<NotificationResult> {
    if (!dto.email) {
      throw new BadRequestException('email is required for EMAIL channel');
    }

    const apiKey = process.env.SENDGRID_API_KEY;

    if (!apiKey) {
      this.logger.warn('SENDGRID_API_KEY not configured. Email not sent.');
      return {
        channel: NotificationChannel.EMAIL,
        recipient: dto.email,
        status: NotificationStatus.QUEUED,
        error: 'SendGrid not configured',
      };
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: dto.email }] }],
          from: { email: process.env.SENDGRID_FROM_EMAIL || 'noreply@aala.land' },
          subject: dto.subject || 'Notification from AALA',
          content: [{ type: 'text/plain', value: dto.body }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const messageId = response.headers.get('x-message-id') ?? undefined;
      this.logger.log(`Email sent to ${dto.email}`);

      return {
        channel: NotificationChannel.EMAIL,
        recipient: dto.email,
        status: NotificationStatus.SENT,
        externalId: messageId,
      };
    } catch (err) {
      this.logger.error(`Email send failed for ${dto.email}: ${err.message}`);
      return {
        channel: NotificationChannel.EMAIL,
        recipient: dto.email,
        status: NotificationStatus.FAILED,
        error: err.message,
      };
    }
  }

  private async sendSms(dto: SendNotificationDto): Promise<NotificationResult> {
    if (!dto.phone) {
      throw new BadRequestException('phone is required for SMS channel');
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn('Twilio credentials not configured. SMS not sent.');
      return {
        channel: NotificationChannel.SMS,
        recipient: dto.phone,
        status: NotificationStatus.QUEUED,
        error: 'Twilio not configured',
      };
    }

    try {
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: dto.phone,
            From: fromNumber,
            Body: dto.body,
          }).toString(),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data = (await response.json()) as { sid: string };
      this.logger.log(`SMS sent to ${dto.phone}, SID: ${data.sid}`);

      return {
        channel: NotificationChannel.SMS,
        recipient: dto.phone,
        status: NotificationStatus.SENT,
        externalId: data.sid,
      };
    } catch (err) {
      this.logger.error(`SMS send failed for ${dto.phone}: ${err.message}`);
      return {
        channel: NotificationChannel.SMS,
        recipient: dto.phone,
        status: NotificationStatus.FAILED,
        error: err.message,
      };
    }
  }
}
