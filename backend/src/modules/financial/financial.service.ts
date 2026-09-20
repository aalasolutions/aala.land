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
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './entities/transaction.entity';
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
  regionTimezoneSql,
  regionTodaySql,
} from '../../shared/utils/region-time.util';
import {
  dateRange,
  monthSeries,
} from '../../shared/utils/month-series.util';
import { pageSkip, clampLimit } from '../../shared/utils/pagination.util';

// The business date a transaction belongs to, falling back to when it was
// recorded because transaction_date is nullable. Matches the dashboard trend.
const BUSINESS_DATE = `COALESCE(t.transaction_date, (t.created_at AT TIME ZONE ${regionTimezoneSql('t.region_code')})::date)`;

export interface CategoryTotal {
  category: string;
  type: TransactionType;
  total: number;
}

export interface CashflowPoint {
  month: string;
  income: number;
  expense: number;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
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
    const transaction = this.transactionRepository.create({
      ...dto,
      companyId,
      regionCode: await this.resolveTransactionRegion(
        companyId,
        dto.unitId,
        activeRegionCode,
        caller,
      ),
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
    page = 1,
    limit = 20,
    type?: string,
    ownerId?: string,
    regionCode?: string,
    caller?: RegionScope,
    from?: string,
    to?: string,
  ): Promise<{
    data: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
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

    const bounds = dateRange(from, to);
    if (bounds) {
      qb.andWhere(`${BUSINESS_DATE} BETWEEN :from AND :to`, bounds);
    }

    qb.skip(pageSkip(page, limit))
      .take(clampLimit(limit))
      .orderBy('t.createdAt', 'DESC');

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
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
      await this.assertUnitNotArchivedLocked(
        manager,
        transaction.unitId,
        companyId,
        'This unit is archived. Its records can no longer be edited.',
      );

      if (dto.status === TransactionStatus.COMPLETED && !transaction.paidAt) {
        transaction.paidAt = new Date();
      }

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
    const unitRegion = await this.regionOfUnit(unitId, companyId);
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

  // Transaction takes its unit's region, same chain cheque/work-order columns were backfilled from.
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

  async getSummary(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
    from?: string,
    to?: string,
  ): Promise<TransactionSummary> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return { totalIncome: 0, totalExpense: 0, net: 0 };
    }

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(
        'COALESCE(SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END), 0)',
        'totalIncome',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END), 0)',
        'totalExpense',
      )
      .where(
        't.companyId = :companyId AND t.status NOT IN (:...excludedStatuses)',
        {
          companyId,
          excludedStatuses: [
            TransactionStatus.CANCELLED,
            TransactionStatus.FAILED,
          ],
        },
      )
      .setParameters({
        income: TransactionType.INCOME,
        expense: TransactionType.EXPENSE,
      });

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    const bounds = dateRange(from, to);
    if (bounds) {
      qb.andWhere(`${BUSINESS_DATE} BETWEEN :from AND :to`, bounds);
    }

    const result = await qb.getRawOne();

    const totalIncome = Number(result?.totalIncome ?? 0);
    const totalExpense = Number(result?.totalExpense ?? 0);

    return {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
    };
  }

  // One row per category actually present, split by type, over the given range.
  async getCategoryBreakdown(
    companyId: string,
    from?: string,
    to?: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<CategoryTotal[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) return [];

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select('t.category', 'category')
      .addSelect('t.type', 'type')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.status NOT IN (:...excluded)', {
        excluded: [TransactionStatus.CANCELLED, TransactionStatus.FAILED],
      })
      .groupBy('t.category')
      .addGroupBy('t.type')
      .orderBy('3', 'DESC');

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    const bounds = dateRange(from, to);
    if (bounds) {
      qb.andWhere(`${BUSINESS_DATE} BETWEEN :from AND :to`, bounds);
    }

    const rows = await qb.getRawMany<{
      category: string | null;
      type: TransactionType;
      total: string;
    }>();

    return rows.map((row) => ({
      category: row.category ?? 'OTHER',
      type: row.type,
      total: Number(row.total),
    }));
  }

  // Income and expense per month, oldest first, zero-filled so a gap in the
  // data does not shorten the series.
  async getCashflowTrend(
    companyId: string,
    months = 6,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<CashflowPoint[]> {
    const series = monthSeries(months);
    const empty = series.map((month) => ({ month, income: 0, expense: 0 }));

    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) return empty;

    const bucket = `date_trunc('month', ${BUSINESS_DATE})`;
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(`to_char(${bucket}, 'YYYY-MM')`, 'month')
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END), 0)`,
        'income',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END), 0)`,
        'expense',
      )
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.status NOT IN (:...excluded)', {
        excluded: [TransactionStatus.CANCELLED, TransactionStatus.FAILED],
      })
      .andWhere(`${bucket} >= :from`, { from: `${series[0]}-01` })
      .groupBy(`to_char(${bucket}, 'YYYY-MM')`)
      .setParameters({
        income: TransactionType.INCOME,
        expense: TransactionType.EXPENSE,
      });

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    const rows = await qb.getRawMany<{
      month: string;
      income: string;
      expense: string;
    }>();
    const found = new Map(rows.map((row) => [row.month, row]));

    return series.map((month) => ({
      month,
      income: Number(found.get(month)?.income ?? 0),
      expense: Number(found.get(month)?.expense ?? 0),
    }));
  }

  async getDepositReminders(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<{
    overdue: Transaction[];
    dueToday: Transaction[];
    dueThisWeek: Transaction[];
    dueThisMonth: Transaction[];
  }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return { overdue: [], dueToday: [], dueThisWeek: [], dueThisMonth: [] };
    }

    const today = regionTodaySql('t.region_code');
    const weekEnd = `(${today} + (7 - EXTRACT(DOW FROM ${today}))::int)`;
    const monthEnd = `((date_trunc('month', ${today}) + interval '1 month - 1 day')::date)`;

    const bucket = (condition: string) => {
      const qb = this.transactionRepository
        .createQueryBuilder('t')
        .where('t.company_id = :companyId', { companyId })
        .andWhere('t.type = :type', { type: TransactionType.INCOME })
        .andWhere('t.status = :status', { status: TransactionStatus.PENDING })
        .andWhere(condition)
        .orderBy('t.due_date', 'ASC')
        .take(100);
      if (regionCodes) {
        qb.andWhere('t.region_code IN (:...regionCodes)', { regionCodes });
      }
      return qb.getMany();
    };

    const [overdue, dueToday, dueThisWeek, dueThisMonth] = await Promise.all([
      bucket(`t.due_date < ${today}`),
      bucket(`t.due_date = ${today}`),
      bucket(`t.due_date > ${today} AND t.due_date <= ${weekEnd}`),
      bucket(`t.due_date > ${weekEnd} AND t.due_date <= ${monthEnd}`),
    ]);

    return { overdue, dueToday, dueThisWeek, dueThisMonth };
  }
}
