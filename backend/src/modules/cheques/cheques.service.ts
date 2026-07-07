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
    const isStatusChange = dto.status !== undefined && dto.status !== cheque.status;

    if (terminalStatuses.includes(cheque.status) && isStatusChange) {
      throw new BadRequestException(`Cannot change the status of a cheque that is already ${cheque.status}`);
    }

    const hasRealChanges = Object.keys(dto).some(key => {
      const k = key as keyof UpdateChequeDto;
      return dto[k] !== undefined && dto[k] !== cheque[k];
    });

    if (!hasRealChanges) {
      return cheque; // Exit early: nothing actually changed
    }

    const oldStatus = cheque.status;
    const expectedVersion = cheque.version;
    Object.assign(cheque, dto);

    if (cheque.status === ChequeStatus.DEPOSITED && !cheque.depositDate) {
      cheque.depositDate = new Date();
    }

    // Single guarded conditional UPDATE for BOTH status and non-status edits.
    // The optimistic-lock version guard (WHERE version = :expectedVersion,
    // SET version = version + 1) rejects any concurrent edit in either
    // direction: a concurrent non-status edit that leaves status unchanged
    // no longer wins last-write, and a concurrent status transition still
    // fails the version compare-and-set. When this IS a status change we also
    // re-assert the previously-read status and terminal exclusion, so a status
    // move can only commit from the exact state we validated.
    const qb = this.chequeRepository
      .createQueryBuilder()
      .update(Cheque)
      .set({
        status: cheque.status,
        depositDate: cheque.depositDate,
        dueDate: cheque.dueDate,
        amount: cheque.amount,
        chequeNumber: cheque.chequeNumber,
        bankName: cheque.bankName,
        unitId: cheque.unitId,
        type: cheque.type,
        notes: cheque.notes,
        version: () => 'version + 1',
        updatedAt: () => 'now()',
      })
      .where('id = :id', { id })
      .andWhere('company_id = :companyId', { companyId })
      .andWhere('version = :expectedVersion', { expectedVersion });

    if (isStatusChange) {
      qb.andWhere('status = :oldStatus', { oldStatus }).andWhere(
        'status NOT IN (:...terminalStatuses)',
        { terminalStatuses },
      );
    }

    const result = await qb.execute();

    if (!result.affected) {
      // The row changed (status or any other column) between our read and
      // write, so the version no longer matches.
      throw new BadRequestException(
        'Cheque was modified concurrently. Please refresh and try again.',
      );
    }

    const saved = await this.findOne(id, companyId);

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

        let notificationType = NotificationType.SYSTEM;
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
        } else if (saved.status === ChequeStatus.BOUNCED) {
          notificationType = NotificationType.CHEQUE_BOUNCED;
          title = 'Cheque Bounced';
          message = `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} has been marked as BOUNCED.`;
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
    // Existence + tenant check.
    await this.findOne(id, companyId);

    // Atomic increment: compute bounce_count in the database (SET col = col + 1)
    // so concurrent bounces do not lose increments via a JS read-modify-write.
    // The other bounce fields are written in the same UPDATE statement.
    const result = await this.chequeRepository
      .createQueryBuilder()
      .update(Cheque)
      .set({
        bounceCount: () => 'bounce_count + 1',
        bounceReason: dto.bounceReason || null,
        lastBounceDate: new Date(),
        status: ChequeStatus.BOUNCED,
        // Bump the optimistic-lock version so a concurrent update() that read an
        // older version fails its version guard and cannot revert this BOUNCED row.
        version: () => 'version + 1',
      })
      .where('id = :id', { id })
      .andWhere('company_id = :companyId', { companyId })
      .execute();

    if (!result.affected) {
      throw new NotFoundException('Cheque not found');
    }

    const saved = await this.findOne(id, companyId);

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
