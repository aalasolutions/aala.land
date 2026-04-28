import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { Cheque, ChequeStatus } from './entities/cheque.entity';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';
import { BounceChequeDto } from './dto/bounce-cheque.dto';
import { REGION_FILTER_SUBQUERY } from '../../shared/utils/region-filter.util';
import { paginationOptions, pageSkip } from '../../shared/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class ChequesService {
  private readonly logger = new Logger(ChequesService.name);

  constructor(
    @InjectRepository(Cheque)
    private readonly chequeRepository: Repository<Cheque>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly notificationsGateway: NotificationsGateway,
  ) { }

  async create(companyId: string, dto: CreateChequeDto, userId?: string): Promise<Cheque> {
    const cheque = this.chequeRepository.create({ ...dto, companyId });
    const saved = await this.chequeRepository.save(cheque);

    this.notificationsGateway.broadcastToCompany(companyId, 'chequeUpdated', {
      id: saved.id,
      status: saved.status,
      updatedBy: userId,
    });

    return saved;
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
  ): Promise<{ data: Cheque[]; total: number; page: number; limit: number }> {
    if (regionCode) {
      const qb = this.chequeRepository
        .createQueryBuilder('c')
        .where('c.companyId = :companyId', { companyId })
        .andWhere(
          `c.unitId IN (${REGION_FILTER_SUBQUERY})`,
          { regionCode },
        )
        .skip(pageSkip(page, limit))
        .take(limit)
        .orderBy('c.dueDate', 'ASC');

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    const [data, total] = await this.chequeRepository.findAndCount({
      where: { companyId },
      ...paginationOptions(page, limit),
      order: { dueDate: 'ASC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Cheque> {
    const cheque = await this.chequeRepository.findOne({ where: { id, companyId } });
    if (!cheque) {
      throw new NotFoundException('Cheque not found');
    }
    return cheque;
  }

  async update(id: string, companyId: string, dto: UpdateChequeDto, userId?: string): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId);

    const terminalStatuses = [ChequeStatus.CLEARED, ChequeStatus.CANCELLED, ChequeStatus.REPLACED];
    if (terminalStatuses.includes(cheque.status) && dto.status && dto.status !== cheque.status) {
      throw new BadRequestException(`Cannot change the status of a cheque that is already ${cheque.status}`);
    }

    const oldStatus = cheque.status;
    Object.assign(cheque, dto);

    if (cheque.status === ChequeStatus.DEPOSITED && !cheque.depositDate) {
      cheque.depositDate = new Date();
    }

    const saved = await this.chequeRepository.save(cheque);

    this.notificationsGateway.broadcastToCompany(companyId, 'chequeUpdated', {
      id: saved.id,
      status: saved.status,
      updatedBy: userId,
    });

    if (oldStatus !== saved.status) {
      const admins = await this.usersService.findAdmins(companyId);
      for (const admin of admins) {
        if (admin.id === userId) {
          continue;
        }

        let notificationType = NotificationType.CHEQUE_DUE;
        let title = 'Cheque Status Updated';
        let message = `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} status changed to ${saved.status}`;

        if (saved.status === ChequeStatus.DEPOSITED) {
          notificationType = NotificationType.CHEQUE_DEPOSITED;
          title = 'Cheque Deposited';
          message = `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} has been marked as DEPOSITED.`;
        } else if (saved.status === ChequeStatus.CLEARED) {
          notificationType = NotificationType.PAYMENT_RECEIVED;
          title = 'Cheque Cleared';
          message = `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} has been CLEARED. Payment received.`;
        } else if (saved.status === ChequeStatus.CANCELLED) {
          notificationType = NotificationType.SYSTEM;
          title = 'Cheque Cancelled';
          message = `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} has been CANCELLED.`;
        }

        try {
          await this.notificationsService.create(companyId, {
            userId: admin.id,
            title,
            message,
            type: notificationType,
            entityType: 'cheque',
            entityId: saved.id,
          });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to create cheque status notification for cheque ${saved.id}: ${messageText}`);
        }
      }
    }

    return saved;
  }

  async processOcr(id: string, companyId: string, imageUrl: string): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId);
    cheque.ocrImageUrl = imageUrl;

    try {
      const ocrResult = await this.runOcrExtraction(imageUrl);
      cheque.ocrData = ocrResult;
      cheque.ocrProcessed = true;
      this.logger.log(`OCR processed for cheque ${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`OCR failed for cheque ${id}: ${message}`);
      cheque.ocrProcessed = false;
    }

    return this.chequeRepository.save(cheque);
  }

  async bounce(id: string, companyId: string, dto: BounceChequeDto, userId?: string): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId);
    cheque.bounceCount = (cheque.bounceCount || 0) + 1;
    cheque.bounceReason = dto.bounceReason || null;
    cheque.lastBounceDate = new Date();
    cheque.status = ChequeStatus.BOUNCED;
    const saved = await this.chequeRepository.save(cheque);

    this.notificationsGateway.broadcastToCompany(companyId, 'chequeUpdated', {
      id: saved.id,
      status: saved.status,
      updatedBy: userId,
    });

    const admins = await this.usersService.findAdmins(companyId);
    for (const admin of admins) {
      if (admin.id === userId) {
        continue;
      }

      try {
        await this.notificationsService.create(companyId, {
          userId: admin.id,
          title: 'Cheque Bounced!',
          message: `Cheque #${saved.chequeNumber} from ${saved.accountHolder} for ${saved.amount} ${saved.currency} has bounced. Reason: ${saved.bounceReason || 'Not specified'}`,
          type: NotificationType.CHEQUE_BOUNCED,
          entityType: 'cheque',
          entityId: saved.id,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to create cheque bounce notification for cheque ${saved.id}: ${messageText}`);
      }
    }

    return saved;
  }

  async getCollectionSchedule(companyId: string): Promise<{
    overdue: Cheque[];
    thisWeek: Cheque[];
    nextWeek: Cheque[];
    thisMonth: Cheque[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const endOfNextWeek = new Date(endOfWeek);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const baseWhere = { companyId, status: ChequeStatus.PENDING };

    const [overdue, thisWeek, nextWeek, thisMonth] = await Promise.all([
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: LessThan(today) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: Between(today, endOfWeek) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: Between(endOfWeek, endOfNextWeek) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: Between(endOfNextWeek, endOfMonth) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
    ]);

    return { overdue, thisWeek, nextWeek, thisMonth };
  }

  async remove(id: string, companyId: string): Promise<void> {
    const cheque = await this.findOne(id, companyId);
    await this.chequeRepository.remove(cheque);
  }

  private async runOcrExtraction(imageUrl: string): Promise<Record<string, unknown>> {
    const apiKey = process.env.OCR_API_KEY;

    if (!apiKey) {
      this.logger.warn('OCR_API_KEY not configured. Returning empty OCR data.');
      return { raw: null, confidence: 0, provider: 'none' };
    }

    const response = await fetch('https://api.ocr.space/parse/imageurl', {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: imageUrl, language: 'eng', isTable: 'true' }).toString(),
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
