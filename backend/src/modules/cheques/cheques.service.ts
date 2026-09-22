import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  In,
  Not,
  FindOptionsWhere,
  DataSource,
  EntityManager,
} from 'typeorm';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { Cheque, ChequeStatus } from './entities/cheque.entity';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';
import { BounceChequeDto } from './dto/bounce-cheque.dto';
import { ClearChequeDto } from './dto/clear-cheque.dto';
import { UnclearChequeDto } from './dto/unclear-cheque.dto';
import {
  assertChequeClearedDate,
  assertChequeDepositDate,
  chequeTransactionCategory,
} from './cheque-transaction.util';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';
import {
  regionToday,
  regionTodaySql,
} from '../../shared/utils/region-time.util';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
  PaymentMethod,
} from '../financial/entities/transaction.entity';
import { assertTransactionDateInWindow } from '../financial/transaction-date-window.util';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Company } from '../companies/entities/company.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';

// Terminal statuses. BOUNCED is excluded: a bounced cheque may bounce again.
const BOUNCE_BLOCKED_STATUSES = [
  ChequeStatus.CLEARED,
  ChequeStatus.CANCELLED,
  ChequeStatus.REPLACED,
];

const ARCHIVED_UNIT_LOCKED_MESSAGE =
  'This unit is archived. Its records can no longer be edited.';
const ARCHIVED_LEASE_LOCKED_MESSAGE =
  'This lease is archived. Its records can no longer be edited.';

@Injectable()
export class ChequesService {
  private readonly logger = new Logger(ChequesService.name);

  constructor(
    @InjectRepository(Cheque)
    private readonly chequeRepository: Repository<Cheque>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly dataSource: DataSource,
    private readonly recordHistoryService: RecordHistoryService,
  ) {}

  async create(
    companyId: string,
    dto: CreateChequeDto,
    userId?: string,
    caller?: RegionScope,
    activeRegionCode?: string,
  ): Promise<Cheque> {
    await this.assertUnitInCallerRegions(dto.unitId, companyId, caller, true);
    await this.assertLeaseOpenForCheque(dto.leaseId, companyId);
    const regionCode = await this.resolveChequeRegion(
      companyId,
      dto.unitId,
      dto.regionCode ?? activeRegionCode,
      caller,
    );
    const cheque = this.chequeRepository.create({
      ...dto,
      companyId,
      regionCode,
    });
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.assertChequeEditable(
        manager,
        dto.unitId ?? null,
        dto.leaseId ?? null,
        companyId,
      );
      return manager.getRepository(Cheque).save(cheque);
    });

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
    caller?: RegionScope,
  ): Promise<{ data: Cheque[]; total: number; page: number; limit: number }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const [data, total] = await this.chequeRepository.findAndCount({
      where: {
        companyId,
        ...(regionCodes ? { regionCode: In(regionCodes) } : {}),
      },
      relations: { unit: true },
      ...paginationOptions(page, limit),
      order: { dueDate: 'ASC' },
    });
    return { data, total, page, limit };
  }

  // A cheque's region is its unit's, so a unit the caller cannot read must not be bound to one.
  private async assertUnitInCallerRegions(
    unitId: string | null | undefined,
    companyId: string,
    caller?: RegionScope,
    rejectArchived = false,
  ): Promise<void> {
    if (!unitId) {
      return;
    }

    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Unit not found');
    }

    const where: FindOptionsWhere<Unit> = { id: unitId, companyId };
    if (scopedCodes) {
      where.asset = { locality: { city: { regionCode: In(scopedCodes) } } };
    }

    const unit = await this.unitRepository.findOne({
      where,
      select: { id: true, deletedAt: true },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    if (rejectArchived && unit.deletedAt) {
      throw new ConflictException('This unit is archived.');
    }
  }

  private async assertLeaseOpenForCheque(
    leaseId: string | undefined,
    companyId: string,
  ): Promise<void> {
    if (!leaseId) {
      return;
    }
    const lease = await this.leaseRepository.findOne({
      where: { id: leaseId, companyId },
      select: { id: true, unitId: true, deletedAt: true },
    });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    if (lease.deletedAt) {
      throw new ConflictException('This lease is archived.');
    }
    const unit = await this.unitRepository.findOne({
      where: { id: lease.unitId, companyId },
      select: { id: true, deletedAt: true },
    });
    if (unit?.deletedAt) {
      throw new ConflictException('This unit is archived.');
    }
  }

  // FOR SHARE so an archive cannot commit in between.
  private async assertChequeEditable(
    manager: EntityManager,
    unitId: string | null,
    leaseId: string | null,
    companyId: string,
  ): Promise<void> {
    const unitIds = new Set<string>(unitId ? [unitId] : []);
    if (leaseId) {
      const lease = await manager.findOne(Lease, {
        where: { id: leaseId, companyId },
        select: { id: true, unitId: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      if (!lease) {
        throw new NotFoundException('Lease not found');
      }
      if (lease.deletedAt) {
        throw new ConflictException(ARCHIVED_LEASE_LOCKED_MESSAGE);
      }
      if (lease.unitId) {
        unitIds.add(lease.unitId);
      }
    }
    for (const id of unitIds) {
      const unit = await manager.findOne(Unit, {
        where: { id, companyId },
        select: { id: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
      if (unit.deletedAt) {
        throw new ConflictException(ARCHIVED_UNIT_LOCKED_MESSAGE);
      }
    }
  }

  // Cheque region: unit's region, else caller's working region, else company default.
  private async resolveChequeRegion(
    companyId: string,
    unitId: string | null | undefined,
    regionCode: string | undefined,
    caller?: RegionScope,
  ): Promise<string> {
    const unitRegion = await this.regionOfUnit(unitId, companyId);
    if (unitRegion) {
      return unitRegion;
    }
    return resolveRegionCode(
      this.companyRepository,
      companyId,
      regionCode,
      caller,
    );
  }

  private async regionOfUnit(
    unitId: string | null | undefined,
    companyId: string,
  ): Promise<string | undefined> {
    if (!unitId) {
      return undefined;
    }
    const row = await this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'a')
      .innerJoin('a.locality', 'loc')
      .innerJoin('loc.city', 'ci')
      .select('ci.regionCode', 'regionCode')
      .where('u.id = :unitId', { unitId })
      .andWhere('u.companyId = :companyId', { companyId })
      .getRawOne<{ regionCode: string }>();
    return row?.regionCode ?? undefined;
  }

  async findOne(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Cheque> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Cheque not found');
    }

    const cheque = await this.chequeRepository.findOne({
      where: {
        id,
        companyId,
        ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
      },
    });
    if (!cheque) {
      throw new NotFoundException('Cheque not found');
    }
    return cheque;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateChequeDto,
    userId?: string,
    caller?: RegionScope,
  ): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId, caller);
    const { reason, ...changes } = dto;
    await this.assertUnitInCallerRegions(
      changes.unitId,
      companyId,
      caller,
      changes.unitId !== cheque.unitId,
    );

    const terminalStatuses = [
      ChequeStatus.CLEARED,
      ChequeStatus.CANCELLED,
      ChequeStatus.REPLACED,
    ];
    const isStatusChange =
      changes.status !== undefined && changes.status !== cheque.status;

    if (terminalStatuses.includes(cheque.status) && isStatusChange) {
      throw new BadRequestException(
        `Cannot change the status of a cheque that is already ${cheque.status}`,
      );
    }

    // Clearing writes a transaction, so it cannot happen through a generic field update.
    if (isStatusChange && changes.status === ChequeStatus.CLEARED) {
      throw new BadRequestException(
        'Use the clear endpoint to mark a cheque as cleared, so the payment is recorded.',
      );
    }

    // Fields clear() copies onto the transaction; unitId covers regionCode.
    if (cheque.status === ChequeStatus.CLEARED) {
      const amountChanged =
        changes.amount !== undefined &&
        Number(changes.amount) !== Number(cheque.amount);
      // dueDate: copied onto the transaction, and clearedDate was validated against it.
      const copied: (keyof typeof changes)[] = [
        'type',
        'unitId',
        'chequeNumber',
        'dueDate',
        'depositDate',
      ];
      const otherChanged = copied.some(
        (field) =>
          changes[field] !== undefined && changes[field] !== cheque[field],
      );
      if (amountChanged || otherChanged) {
        throw new ConflictException(
          'A cleared cheque records a payment. Its amount, type, unit, number and dates cannot be changed. Un-clear it first.',
        );
      }
    }

    if (
      isStatusChange &&
      changes.status === ChequeStatus.CANCELLED &&
      !reason?.trim()
    ) {
      throw new BadRequestException('A reason is required to cancel a cheque.');
    }

    const hasRealChanges = Object.keys(changes).some((key) => {
      const k = key as keyof typeof changes;
      return changes[k] !== undefined && changes[k] !== cheque[k];
    });

    if (!hasRealChanges) {
      return cheque;
    }

    const oldStatus = cheque.status;
    const oldUnitId = cheque.unitId;
    const expectedVersion = cheque.version;
    Object.assign(cheque, changes);

    // The region follows the unit, so moving the cheque moves the row.
    if (changes.unitId !== undefined && changes.unitId !== oldUnitId) {
      cheque.regionCode = await this.resolveChequeRegion(
        companyId,
        changes.unitId,
        undefined,
        caller,
      );
    }

    if (cheque.status === ChequeStatus.DEPOSITED && !cheque.depositDate) {
      cheque.depositDate = regionToday(cheque.regionCode);
    }

    // Version guard rejects concurrent edits; status change re-checks status and terminal state.
    await this.dataSource.transaction(async (manager) => {
      await this.assertChequeEditable(
        manager,
        oldUnitId,
        cheque.leaseId,
        companyId,
      );
      if (cheque.unitId && cheque.unitId !== oldUnitId) {
        const target = await manager.findOne(Unit, {
          where: { id: cheque.unitId, companyId },
          select: { id: true, deletedAt: true },
          lock: { mode: 'pessimistic_read' },
        });
        if (!target) {
          throw new NotFoundException('Unit not found');
        }
        if (target.deletedAt) {
          throw new ConflictException('This unit is archived.');
        }
      }
      const qb = manager
        .getRepository(Cheque)
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
          regionCode: cheque.regionCode,
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
        // Version changed between read and write.
        throw new BadRequestException(
          'Cheque was modified concurrently. Please refresh and try again.',
        );
      }

      if (isStatusChange) {
        await this.recordChequeHistory(
          manager,
          cheque,
          this.statusHistoryAction(cheque.status),
          userId,
          reason,
          { from: oldStatus, to: cheque.status },
        );
      }
    });

    // Re-read of a row this caller just wrote, so it stays unscoped.
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
          // These go to admins, who read every region.
          await this.notificationsService.create(companyId, {
            userId: admin.id,
            title,
            message,
            type: notificationType,
            entityType: 'cheque',
            entityId: saved.id,
          });
        } catch (error) {
          const messageText = errorMessage(error);
          this.logger.error(
            `Failed to create cheque status notification for cheque ${saved.id}: ${messageText}`,
          );
        }
      }
    }

    return saved;
  }

  async processOcr(
    id: string,
    companyId: string,
    imageUrl: string,
    caller?: RegionScope,
  ): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId, caller);
    cheque.ocrImageUrl = imageUrl;

    try {
      const ocrResult = await this.runOcrExtraction(imageUrl);
      cheque.ocrData = ocrResult;
      cheque.ocrProcessed = true;
      this.logger.log(`OCR processed for cheque ${id}`);
    } catch (err) {
      const message = errorMessage(err);
      this.logger.error(`OCR failed for cheque ${id}: ${message}`);
      cheque.ocrProcessed = false;
    }

    return this.chequeRepository.save(cheque);
  }

  async bounce(
    id: string,
    companyId: string,
    dto: BounceChequeDto,
    userId?: string,
    caller?: RegionScope,
  ): Promise<Cheque> {
    // Existence + tenant check.
    const cheque = await this.findOne(id, companyId, caller);
    this.assertBounceable(cheque.status);

    await this.dataSource.transaction(async (manager) => {
      await this.assertChequeEditable(
        manager,
        cheque.unitId,
        cheque.leaseId,
        companyId,
      );
      // Increment in SQL so concurrent bounces do not lose counts.
      const result = await manager
        .getRepository(Cheque)
        .createQueryBuilder()
        .update(Cheque)
        .set({
          bounceCount: () => 'bounce_count + 1',
          bounceReason: dto.bounceReason || null,
          lastBounceDate: new Date(),
          status: ChequeStatus.BOUNCED,
          // Bump version so a stale update() cannot revert BOUNCED.
          version: () => 'version + 1',
          updatedAt: () => 'now()',
        })
        .where('id = :id', { id })
        .andWhere('company_id = :companyId', { companyId })
        // Predicate as well as the precheck, so a concurrent clear is not overwritten.
        .andWhere('status NOT IN (:...terminal)', {
          terminal: BOUNCE_BLOCKED_STATUSES,
        })
        .execute();

      // Zero rows means gone or terminal mid-flight; only this path pays to tell them apart.
      if (!result.affected) {
        const current = await manager.findOne(Cheque, {
          where: { id, companyId },
          select: { id: true, status: true },
        });
        if (!current) {
          throw new NotFoundException('Cheque not found');
        }
        throw new ConflictException(
          `This cheque became ${current.status} while the bounce was being recorded.`,
        );
      }

      await this.recordChequeHistory(
        manager,
        cheque,
        RecordHistoryAction.BOUNCE,
        userId,
        dto.bounceReason,
      );
    });

    // Re-read of a row this caller just wrote, so it stays unscoped.
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
        const messageText = errorMessage(error);
        this.logger.error(
          `Failed to create cheque bounce notification for cheque ${saved.id}: ${messageText}`,
        );
      }
    }

    return saved;
  }

  async clear(
    id: string,
    companyId: string,
    dto: ClearChequeDto,
    userId?: string,
    caller?: RegionScope,
  ): Promise<Cheque> {
    // Existence, tenant and region check.
    const cheque = await this.findOne(id, companyId, caller);
    this.assertClearable(cheque.status);

    // Only a cheque clearing straight from PENDING may supply a deposit date.
    if (
      cheque.depositDate &&
      dto.depositDate &&
      dto.depositDate !== cheque.depositDate
    ) {
      throw new BadRequestException(
        'This cheque already has a deposit date, which cannot be changed while clearing it.',
      );
    }
    const depositDate = cheque.depositDate ?? dto.depositDate ?? null;
    if (!cheque.depositDate && dto.depositDate) {
      assertChequeDepositDate(
        dto.depositDate,
        regionToday(cheque.regionCode, cheque.createdAt),
        dto.clearedDate,
      );
    }

    assertChequeClearedDate(dto.clearedDate, cheque.dueDate, depositDate);
    // The same window finance enforces on every money date: 30 days back, never ahead.
    assertTransactionDateInWindow(dto.clearedDate, cheque.regionCode);

    await this.dataSource.transaction(async (manager) => {
      await this.assertChequeEditable(
        manager,
        cheque.unitId,
        cheque.leaseId,
        companyId,
      );
      // Re-read under a write lock: two concurrent clears must not both pass the check.
      const locked = await manager.findOne(Cheque, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Cheque not found');
      }
      this.assertClearable(locked.status);

      const oldStatus = locked.status;
      // UQ_TRANSACTIONS_ACTIVE_CHEQUE rejects a second non-cancelled row for this cheque.
      await manager.getRepository(Transaction).insert({
        companyId,
        chequeId: locked.id,
        type: TransactionType.INCOME,
        category: chequeTransactionCategory(locked.type),
        status: TransactionStatus.COMPLETED,
        amount: locked.amount,
        currency: locked.currency,
        paymentMethod: PaymentMethod.CHEQUE,
        description: `Cheque #${locked.chequeNumber} from ${locked.accountHolder}`,
        referenceNumber: locked.chequeNumber,
        regionCode: locked.regionCode,
        unitId: locked.unitId ?? undefined,
        transactionDate: dto.clearedDate,
        dueDate: locked.dueDate,
      });

      locked.status = ChequeStatus.CLEARED;
      locked.clearedDate = dto.clearedDate;
      locked.depositDate = depositDate;
      locked.version += 1;
      await manager.getRepository(Cheque).save(locked);

      await this.recordChequeHistory(
        manager,
        locked,
        RecordHistoryAction.STATUS_CHANGE,
        userId,
        null,
        {
          from: oldStatus,
          to: ChequeStatus.CLEARED,
          clearedDate: dto.clearedDate,
          depositDate,
        },
      );
    });

    // Re-read of a row this caller just wrote, so it stays unscoped.
    const saved = await this.findOne(id, companyId);
    await this.announceChequeStatus(
      saved,
      userId,
      NotificationType.PAYMENT_RECEIVED,
      'Cheque Cleared',
      `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} has been CLEARED on ${saved.clearedDate}. Payment received.`,
    );
    return saved;
  }

  async unclear(
    id: string,
    companyId: string,
    dto: UnclearChequeDto,
    userId?: string,
    caller?: RegionScope,
  ): Promise<Cheque> {
    // Existence, tenant and region check.
    const cheque = await this.findOne(id, companyId, caller);
    if (cheque.status !== ChequeStatus.CLEARED) {
      throw new BadRequestException('This cheque is not cleared.');
    }

    let cancelled = 0;
    await this.dataSource.transaction(async (manager) => {
      await this.assertChequeEditable(
        manager,
        cheque.unitId,
        cheque.leaseId,
        companyId,
      );
      const locked = await manager.findOne(Cheque, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Cheque not found');
      }
      if (locked.status !== ChequeStatus.CLEARED) {
        throw new BadRequestException('This cheque is not cleared.');
      }

      // Cancelled not deleted; zero rows is legitimate for a pre-feature cheque.
      const reversal = await manager.getRepository(Transaction).update(
        {
          chequeId: locked.id,
          companyId,
          status: Not(TransactionStatus.CANCELLED),
        },
        { status: TransactionStatus.CANCELLED },
      );
      cancelled = reversal.affected ?? 0;

      locked.status = locked.depositDate
        ? ChequeStatus.DEPOSITED
        : ChequeStatus.PENDING;
      locked.clearedDate = null;
      locked.version += 1;
      await manager.getRepository(Cheque).save(locked);

      await this.recordChequeHistory(
        manager,
        locked,
        RecordHistoryAction.STATUS_CHANGE,
        userId,
        dto.reason,
        {
          from: ChequeStatus.CLEARED,
          to: locked.status,
          cancelledTransactions: cancelled,
        },
      );
    });

    // Re-read of a row this caller just wrote, so it stays unscoped.
    const saved = await this.findOne(id, companyId);
    const moneyOutcome = cancelled
      ? 'its payment was cancelled'
      : 'it had no recorded payment to cancel';
    await this.announceChequeStatus(
      saved,
      userId,
      NotificationType.SYSTEM,
      'Cheque Clearing Reversed',
      `Cheque #${saved.chequeNumber} for ${saved.amount} ${saved.currency} is no longer cleared and ${moneyOutcome}. Reason: ${dto.reason}`,
    );
    return saved;
  }

  private assertBounceable(status: ChequeStatus): void {
    if (BOUNCE_BLOCKED_STATUSES.includes(status)) {
      throw new ConflictException(
        `A ${status.toLowerCase()} cheque cannot be bounced.`,
      );
    }
  }

  private assertClearable(status: ChequeStatus): void {
    if (status === ChequeStatus.CLEARED) {
      throw new ConflictException('This cheque is already cleared.');
    }
    if (status !== ChequeStatus.PENDING && status !== ChequeStatus.DEPOSITED) {
      throw new BadRequestException(
        `A ${status.toLowerCase()} cheque cannot be cleared.`,
      );
    }
  }

  private async announceChequeStatus(
    saved: Cheque,
    userId: string | undefined,
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<void> {
    this.notificationsGateway.broadcastToCompany(
      saved.companyId,
      'chequeUpdated',
      {
        id: saved.id,
        status: saved.status,
        updatedBy: userId,
      },
    );

    const admins = await this.usersService.findAdmins(saved.companyId);
    for (const admin of admins) {
      if (admin.id === userId) {
        continue;
      }
      try {
        // These go to admins, who read every region.
        await this.notificationsService.create(saved.companyId, {
          userId: admin.id,
          title,
          message,
          type,
          entityType: 'cheque',
          entityId: saved.id,
        });
      } catch (error) {
        this.logger.error(
          `Failed to create cheque notification for cheque ${saved.id}: ${errorMessage(error)}`,
        );
      }
    }
  }

  async getCollectionSchedule(
    companyId: string,
    caller?: RegionScope,
  ): Promise<{
    overdue: Cheque[];
    thisWeek: Cheque[];
    nextWeek: Cheque[];
    thisMonth: Cheque[];
  }> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no rows, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      return { overdue: [], thisWeek: [], nextWeek: [], thisMonth: [] };
    }

    const today = regionTodaySql('cheque.region_code');
    const weekEnd = `(${today} + (7 - EXTRACT(DOW FROM ${today}))::int)`;
    const nextWeekEnd = `(${weekEnd} + 7)`;
    const monthEnd = `((date_trunc('month', ${today}) + interval '1 month - 1 day')::date)`;

    const bucket = (condition: string) => {
      const qb = this.chequeRepository
        .createQueryBuilder('cheque')
        .where('cheque.company_id = :companyId', { companyId })
        .andWhere('cheque.status = :status', { status: ChequeStatus.PENDING })
        .andWhere(condition)
        .orderBy('cheque.due_date', 'ASC')
        .take(100);
      if (scopedCodes) {
        qb.andWhere('cheque.region_code IN (:...scopedCodes)', { scopedCodes });
      }
      return qb.getMany();
    };

    const [overdue, thisWeek, nextWeek, thisMonth] = await Promise.all([
      bucket(`cheque.due_date < ${today}`),
      bucket(`cheque.due_date BETWEEN ${today} AND ${weekEnd}`),
      bucket(
        `cheque.due_date > ${weekEnd} AND cheque.due_date <= ${nextWeekEnd}`,
      ),
      bucket(
        `cheque.due_date > ${nextWeekEnd} AND cheque.due_date <= ${monthEnd}`,
      ),
    ]);

    return { overdue, thisWeek, nextWeek, thisMonth };
  }

  async remove(
    id: string,
    companyId: string,
    reason: string,
    userId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Cheque not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const cheque = await manager.findOne(Cheque, {
        where: {
          id,
          companyId,
          ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cheque) {
        throw new NotFoundException('Cheque not found');
      }
      if (cheque.status === ChequeStatus.CLEARED) {
        throw new ConflictException('Cleared cheques cannot be deleted.');
      }

      await this.recordChequeHistory(
        manager,
        cheque,
        RecordHistoryAction.DELETE,
        userId,
        reason,
      );
      await manager.remove(cheque);
    });
  }

  private statusHistoryAction(status: ChequeStatus): RecordHistoryAction {
    if (status === ChequeStatus.CANCELLED) return RecordHistoryAction.CANCEL;
    if (status === ChequeStatus.REPLACED) return RecordHistoryAction.REPLACE;
    return RecordHistoryAction.STATUS_CHANGE;
  }

  private async recordChequeHistory(
    manager: EntityManager,
    cheque: Cheque,
    action: RecordHistoryAction,
    userId: string | undefined,
    reason?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.recordHistoryService.record(manager, {
      companyId: cheque.companyId,
      action,
      entityType: 'Cheque',
      entityId: cheque.id,
      entityTitle: `Cheque ${cheque.chequeNumber}`,
      contextTitle: await this.chequeContextTitle(manager, cheque),
      reason: reason ?? null,
      actorId: userId ?? null,
      actorName: userId
        ? await this.recordHistoryService.resolveActorName(manager, userId)
        : 'System',
      regionCode: cheque.regionCode,
      metadata: metadata ?? null,
    });
  }

  private async chequeContextTitle(
    manager: EntityManager,
    cheque: Cheque,
  ): Promise<string | null> {
    const holder = cheque.accountHolder?.trim();
    if (holder) {
      return holder;
    }
    if (!cheque.unitId) {
      return null;
    }
    const unit = await manager.findOne(Unit, {
      where: { id: cheque.unitId, companyId: cheque.companyId },
      select: { id: true, unitNumber: true },
    });
    return unit ? `Unit ${unit.unitNumber}` : null;
  }

  private async runOcrExtraction(
    imageUrl: string,
  ): Promise<Record<string, unknown>> {
    const apiKey = envString('OCR_API_KEY');

    if (!apiKey) {
      this.logger.warn('OCR_API_KEY not configured. Returning empty OCR data.');
      return { raw: null, confidence: 0, provider: 'none' };
    }

    const response = await fetch('https://api.ocr.space/parse/imageurl', {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        url: imageUrl,
        language: 'eng',
        isTable: 'true',
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
