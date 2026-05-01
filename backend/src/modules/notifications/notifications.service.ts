import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, LessThanOrEqual, IsNull, MoreThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SendNotificationDto, NotificationChannel, NotificationStatus } from './dto/send-notification.dto';
import { Notification, NotificationType } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Cheque, ChequeStatus } from '../cheques/entities/cheque.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { WorkOrder } from '../maintenance/entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import { Role } from '../../shared/enums/roles.enum';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { NotificationsGateway } from './notifications.gateway';

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
    @InjectRepository(Cheque)
    private readonly chequeRepository: Repository<Cheque>,
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ---- Persistence methods ----

  async create(companyId: string, dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({ ...dto, companyId });
    const saved = await this.notificationRepository.save(notification);

    try {
      this.notificationsGateway.sendNotificationToUser(dto.userId, saved);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to emit notification via socket: ${errorMessage}`);
    }

    return saved;
  }

  async findAll(
    companyId: string,
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.notificationRepository.findAndCount({
      where: { companyId, userId },
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async markAsRead(id: string, companyId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, companyId, userId },
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
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Email send failed for ${dto.email}: ${message}`);
      return {
        channel: NotificationChannel.EMAIL,
        recipient: dto.email,
        status: NotificationStatus.FAILED,
        error: message,
      };
    }
  }

  // ---- Reminder check methods ----

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyReminders() {
    this.logger.log('Running daily notification reminders...');
    await this.notifyUpcomingCheques();
    await this.notifyOverdueCheques();
    await this.notifyDelayedCheques();
    await this.notifyUnassignedLeads();
  }

  private async notifyUpcomingCheques() {
    const targetDate = this.startOfDay(this.addDays(new Date(), 3));

    const upcomingCheques = await this.chequeRepository.find({
      where: {
        status: ChequeStatus.PENDING,
        dueDate: targetDate,
      },
    });

    await this.notifyAdminsOncePerDay(upcomingCheques, NotificationType.CHEQUE_DUE, (cheque, admin) => ({
      userId: admin.id,
      title: 'Upcoming Cheque',
      message: `Cheque #${cheque.chequeNumber} for ${cheque.amount} ${cheque.currency} is due in 3 days (${cheque.dueDate})`,
      type: NotificationType.CHEQUE_DUE,
      entityType: 'cheque',
      entityId: cheque.id,
    }));
  }

  private async notifyOverdueCheques() {
    const today = this.startOfToday();

    const overdueCheques = await this.chequeRepository.find({
      where: {
        status: ChequeStatus.PENDING,
        dueDate: LessThan(today),
      },
    });

    await this.notifyAdminsOncePerDay(overdueCheques, NotificationType.CHEQUE_OVERDUE, (cheque, admin) => ({
      userId: admin.id,
      title: 'Overdue Cheque!',
      message: `Cheque #${cheque.chequeNumber} for ${cheque.amount} ${cheque.currency} was due on ${cheque.dueDate} and is still pending.`,
      type: NotificationType.CHEQUE_OVERDUE,
      entityType: 'cheque',
      entityId: cheque.id,
    }));
  }

  private async notifyDelayedCheques() {
    const threeDaysAgo = this.startOfDay(this.addDays(new Date(), -3));

    // Cheques that are DEPOSITED but not CLEARED for more than 3 days
    const delayedCheques = await this.chequeRepository.find({
      where: {
        status: ChequeStatus.DEPOSITED,
        depositDate: LessThanOrEqual(threeDaysAgo),
      },
    });

    await this.notifyAdminsOncePerDay(delayedCheques, NotificationType.CHEQUE_DELAYED, (cheque, admin) => ({
      userId: admin.id,
      title: 'Delayed Cheque Clearing',
      message: `Cheque #${cheque.chequeNumber} was deposited on ${cheque.depositDate} but hasn't cleared yet.`,
      type: NotificationType.CHEQUE_DELAYED,
      entityType: 'cheque',
      entityId: cheque.id,
    }));
  }

  private async notifyUnassignedLeads() {
    const unassignedLeads = await this.leadRepository.find({
      where: {
        status: LeadStatus.NEW,
        assignedTo: IsNull(),
      },
    });

    await this.notifyAdminsOncePerDay(unassignedLeads, NotificationType.LEAD_UNASSIGNED, (lead, admin) => {
      const clientName = `${lead.firstName} ${lead.lastName || ''}`.trim();
      return {
        userId: admin.id,
        title: 'Pending Unassigned Lead',
        message: `Lead for ${clientName} is still unassigned and needs attention.`,
        type: NotificationType.LEAD_UNASSIGNED,
        entityType: 'lead',
        entityId: lead.id,
      };
    });
  }

  async checkRentDueReminders(
    companyId: string,
    daysBefore = 3,
  ): Promise<{
    data: Array<{
      chequeId: string;
      chequeNumber: string;
      amount: number;
      currency: string;
      dueDate: Date;
      accountHolder: string;
      daysUntilDue: number;
    }>;
  }> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + daysBefore);

    const cheques = await this.chequeRepository
      .createQueryBuilder('cheque')
      .where('cheque.company_id = :companyId', { companyId })
      .andWhere('cheque.status = :status', { status: ChequeStatus.PENDING })
      .andWhere('cheque.due_date >= :now', { now: now.toISOString().split('T')[0] })
      .andWhere('cheque.due_date <= :futureDate', { futureDate: futureDate.toISOString().split('T')[0] })
      .orderBy('cheque.due_date', 'ASC')
      .getMany();

    const data = cheques.map((c) => {
      const dueMs = new Date(c.dueDate).getTime() - now.getTime();
      const daysUntilDue = Math.ceil(dueMs / (1000 * 60 * 60 * 24));
      return {
        chequeId: c.id,
        chequeNumber: c.chequeNumber,
        amount: Number(c.amount),
        currency: c.currency,
        dueDate: c.dueDate,
        accountHolder: c.accountHolder,
        daysUntilDue,
      };
    });

    return { data };
  }

  async checkLeaseExpiryAlerts(
    companyId: string,
    daysAhead = 60,
  ): Promise<{
    data: Array<{
      leaseId: string;
      unitId: string;
      tenantName: string;
      endDate: Date;
      daysRemaining: number;
    }>;
  }> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + daysAhead);

    const leases = await this.leaseRepository
      .createQueryBuilder('lease')
      .where('lease.company_id = :companyId', { companyId })
      .andWhere('lease.status = :status', { status: LeaseStatus.ACTIVE })
      .andWhere('lease.end_date >= :now', { now: now.toISOString().split('T')[0] })
      .andWhere('lease.end_date <= :futureDate', { futureDate: futureDate.toISOString().split('T')[0] })
      .orderBy('lease.end_date', 'ASC')
      .getMany();

    const data = leases.map((l) => {
      const endMs = new Date(l.endDate).getTime() - now.getTime();
      const daysRemaining = Math.ceil(endMs / (1000 * 60 * 60 * 24));
      return {
        leaseId: l.id,
        unitId: l.unitId,
        tenantName: l.tenantName,
        endDate: l.endDate,
        daysRemaining,
      };
    });

    return { data };
  }

  async checkMaintenanceReminders(
    companyId: string,
    daysAhead = 7,
  ): Promise<{
    data: Array<{
      workOrderId: string;
      title: string;
      unitId: string | null;
      nextScheduledDate: Date | null;
      daysUntilDue: number;
      category: string;
      priority: string;
    }>;
  }> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + daysAhead);

    const workOrders = await this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.company_id = :companyId', { companyId })
      .andWhere('wo.is_preventive = :isPreventive', { isPreventive: true })
      .andWhere('wo.next_scheduled_date IS NOT NULL')
      .andWhere('wo.next_scheduled_date >= :now', { now: now.toISOString().split('T')[0] })
      .andWhere('wo.next_scheduled_date <= :futureDate', { futureDate: futureDate.toISOString().split('T')[0] })
      .orderBy('wo.next_scheduled_date', 'ASC')
      .getMany();

    const data = workOrders.map((wo) => {
      const dueMs = new Date(wo.nextScheduledDate!).getTime() - now.getTime();
      const daysUntilDue = Math.ceil(dueMs / (1000 * 60 * 60 * 24));
      return {
        workOrderId: wo.id,
        title: wo.title,
        unitId: wo.unitId,
        nextScheduledDate: wo.nextScheduledDate,
        daysUntilDue,
        category: wo.category,
        priority: wo.priority,
      };
    });

    return { data };
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
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMS send failed for ${dto.phone}: ${message}`);
      return {
        channel: NotificationChannel.SMS,
        recipient: dto.phone,
        status: NotificationStatus.FAILED,
        error: message,
      };
    }
  }

  private async findAdminsByCompanyIds(companyIds: string[]): Promise<Map<string, User[]>> {
    const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];
    if (uniqueCompanyIds.length === 0) {
      return new Map();
    }

    const admins = await this.userRepository.find({
      where: {
        companyId: In(uniqueCompanyIds),
        role: In([Role.COMPANY_ADMIN, Role.SUPER_ADMIN]),
        isActive: true,
      },
    });

    const adminsByCompanyId = new Map<string, User[]>();
    for (const admin of admins) {
      const companyAdmins = adminsByCompanyId.get(admin.companyId) ?? [];
      companyAdmins.push(admin);
      adminsByCompanyId.set(admin.companyId, companyAdmins);
    }

    return adminsByCompanyId;
  }

  private async notifyAdminsOncePerDay<T extends { id: string; companyId: string }>(
    items: T[],
    type: NotificationType,
    buildDto: (item: T, admin: User) => CreateNotificationDto,
  ): Promise<void> {
    const adminsByCompanyId = await this.findAdminsByCompanyIds(
      items.map((item) => item.companyId),
    );
    const existingReminderKeys = await this.findExistingReminderKeys({
      adminsByCompanyId,
      companyIds: items.map((item) => item.companyId),
      entityIds: items.map((item) => item.id),
      type,
      since: this.startOfToday(),
    });

    for (const item of items) {
      const admins = adminsByCompanyId.get(item.companyId) ?? [];

      for (const admin of admins) {
        const reminderKey = this.buildReminderKey(admin.id, item.id);
        if (existingReminderKeys.has(reminderKey)) {
          continue;
        }

        await this.create(item.companyId, buildDto(item, admin));
        existingReminderKeys.add(reminderKey);
      }
    }
  }

  private async findExistingReminderKeys({
    adminsByCompanyId,
    companyIds,
    entityIds,
    type,
    since,
  }: {
    adminsByCompanyId: Map<string, User[]>;
    companyIds: string[];
    entityIds: string[];
    type: NotificationType;
    since: Date;
  }): Promise<Set<string>> {
    const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];
    const uniqueEntityIds = [...new Set(entityIds.filter(Boolean))];
    const userIds = [...new Set(
      [...adminsByCompanyId.values()].flatMap((admins) => admins.map((admin) => admin.id)),
    )];

    if (uniqueCompanyIds.length === 0 || uniqueEntityIds.length === 0 || userIds.length === 0) {
      return new Set();
    }

    const existingNotifications = await this.notificationRepository.find({
      where: {
        companyId: In(uniqueCompanyIds),
        userId: In(userIds),
        type,
        entityId: In(uniqueEntityIds),
        createdAt: MoreThanOrEqual(since),
      },
    });

    return new Set(
      existingNotifications.map((notification) =>
        this.buildReminderKey(notification.userId, notification.entityId),
      ),
    );
  }

  private buildReminderKey(userId: string, entityId: string): string {
    return `${userId}:${entityId}`;
  }

  private addDays(date: Date, days: number): Date {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
  }

  private startOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private startOfToday(): Date {
    return this.startOfDay(new Date());
  }
}
