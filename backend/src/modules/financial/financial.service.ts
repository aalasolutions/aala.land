import { regionCurrency } from '../../shared/constants/regions';
import { regionOfUnit } from '../../shared/utils/region-filter.util';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  In,
  FindOptionsWhere,
} from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import { Company } from '../companies/entities/company.entity';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';
import {
  applyMoneyDateRange,
  CashflowPoint,
  CashflowTrendQuery,
  CategoryTotal,
  DateRangeQuery,
  DepositReminders,
  FinancialAnalyticsService,
  TransactionSummary,
} from './financial-analytics.service';
import {
  pageSkip,
  clampLimit,
  clampPage,
} from '../../shared/utils/pagination.util';
import {
  assertCompletedHasDate,
  assertTransactionDateInWindow,
} from './transaction-date-window.util';

export type {
  CashflowPoint,
  CashflowTrendQuery,
  CategoryTotal,
  DateRangeQuery,
  DepositReminder,
  DepositReminders,
  RegionQuery,
  TransactionSummary,
} from './financial-analytics.service';

export interface TransactionListQuery extends DateRangeQuery {
  page?: number;
  limit?: number;
  type?: string;
  ownerId?: string;
}

@Injectable()
export class FinancialService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
    private readonly analytics: FinancialAnalyticsService,
  ) {}

  async create(
    companyId: string,
    dto: CreateTransactionDto,
    activeRegionCode?: string,
    caller?: RegionScope,
  ): Promise<Transaction> {
    if (dto.unitId) {
      const scopedCodes = scopedRegionCodes(caller);
      // No assignment means no access, and an empty IN () is invalid SQL.
      if (scopedCodes?.length === 0) {
        throw new NotFoundException('Unit not found');
      }
      const where: FindOptionsWhere<Unit> = { id: dto.unitId, companyId };
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
      if (unit.deletedAt) {
        throw new ConflictException('This unit is archived.');
      }
    }
    const regionCode = await this.resolveTransactionRegion(
      companyId,
      dto.unitId,
      activeRegionCode,
      caller,
    );
    // The row's own region decides its business day, so the window is checked once it is known.
    assertTransactionDateInWindow(dto.transactionDate, regionCode);
    assertCompletedHasDate(dto.status, dto.transactionDate);
    const transaction = this.transactionRepository.create({
      ...dto,
      companyId,
      regionCode,
      currency: regionCurrency(regionCode),
    });
    return this.dataSource.transaction(async (manager) => {
      await this.assertUnitNotArchivedLocked(
        manager,
        dto.unitId,
        companyId,
        'This unit is archived.',
      );
      return manager.getRepository(Transaction).save(transaction);
    });
  }

  async findAll(
    companyId: string,
    query: TransactionListQuery = {},
  ): Promise<{
    data: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      type,
      ownerId,
      regionCode,
      caller,
      from,
      to,
    } = query;
    const safePage = clampPage(page);
    const safeLimit = clampLimit(limit);
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page: safePage, limit: safeLimit };
    }

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.unit', 'unit')
      .where('t.companyId = :companyId', { companyId });

    if (regionCodes) {
      // Rows without a region stay hidden until the region selector offers Show All.
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    if (ownerId) {
      qb.andWhere('unit.ownerId = :ownerId', { ownerId });
    }

    if (type) {
      qb.andWhere('t.type = :type', { type });
    }

    // The list keeps undated rows in view: an outstanding row is outstanding now.
    applyMoneyDateRange(qb, from, to, true);

    qb.skip(pageSkip(safePage, safeLimit))
      .take(safeLimit)
      .orderBy('t.createdAt', 'DESC')
      // Tiebreaker on the primary key so ties on createdAt cannot repeat or drop rows across pages.
      .addOrderBy('t.id', 'DESC');

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: safePage, limit: safeLimit };
  }

  async findOne(
    id: string,
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<Transaction> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      throw new NotFoundException('Transaction not found');
    }

    const transaction = await this.transactionRepository.findOne({
      where: {
        id,
        companyId,
        ...(regionCodes ? { regionCode: In(regionCodes) } : {}),
      },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateTransactionDto,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<Transaction> {
    await this.findOne(id, companyId, regionCode, caller);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Transaction);
      const transaction = await repo.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      // The cheque owns every editable field on this row.
      if (transaction.chequeId) {
        throw new ConflictException(
          'This payment was recorded by clearing a cheque and cannot be edited here. Un-clear the cheque to change it.',
        );
      }
      // The 30-day record lock is PARKED: it froze PENDING rent-due rows before their due date.
      assertTransactionDateInWindow(
        dto.transactionDate,
        transaction.regionCode,
      );
      await this.assertUnitNotArchivedLocked(
        manager,
        transaction.unitId,
        companyId,
        'This unit is archived. Its records can no longer be edited.',
      );

      assertCompletedHasDate(
        dto.status ?? transaction.status,
        dto.transactionDate !== undefined
          ? dto.transactionDate
          : transaction.transactionDate,
      );

      Object.assign(transaction, dto);
      return repo.save(transaction);
    });
  }

  // Unit region first; caller region validated like a cheque's; with neither, row stays unregioned.
  private async resolveTransactionRegion(
    companyId: string,
    unitId: string | null | undefined,
    regionCode: string | undefined,
    caller?: RegionScope,
  ): Promise<string | null> {
    const unitRegion = await regionOfUnit(
      this.unitRepository,
      unitId,
      companyId,
    );
    if (unitRegion) {
      return unitRegion;
    }
    if (!regionCode) {
      return null;
    }
    return resolveRegionCode(
      this.companyRepository,
      companyId,
      regionCode,
      caller,
    );
  }

  // FOR SHARE so archiveUnit cannot commit in between.
  private async assertUnitNotArchivedLocked(
    manager: EntityManager,
    unitId: string | null | undefined,
    companyId: string,
    message: string,
  ): Promise<void> {
    if (!unitId) {
      return;
    }
    const unit = await manager.findOne(Unit, {
      where: { id: unitId, companyId },
      select: { id: true, deletedAt: true },
      lock: { mode: 'pessimistic_read' },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    if (unit.deletedAt) {
      throw new ConflictException(message);
    }
  }

  // Reporting reads live in FinancialAnalyticsService; these keep the existing route surface.
  getSummary(
    companyId: string,
    query: DateRangeQuery = {},
  ): Promise<TransactionSummary> {
    return this.analytics.getSummary(companyId, query);
  }

  getCategoryBreakdown(
    companyId: string,
    query: DateRangeQuery = {},
  ): Promise<CategoryTotal[]> {
    return this.analytics.getCategoryBreakdown(companyId, query);
  }

  getCashflowTrend(
    companyId: string,
    query: CashflowTrendQuery = {},
  ): Promise<CashflowPoint[]> {
    return this.analytics.getCashflowTrend(companyId, query);
  }

  getDepositReminders(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<DepositReminders> {
    return this.analytics.getDepositReminders(companyId, regionCode, caller);
  }
}
