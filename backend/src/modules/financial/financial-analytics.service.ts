import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './entities/transaction.entity';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import { effectiveRegionCodes } from '../../shared/utils/region-visibility.util';
import {
  businessDateSql,
  regionTodaySql,
} from '../../shared/utils/region-time.util';
import {
  dateRange,
  monthLabelSql,
  monthSeries,
  trendAnchor,
  zeroFillMonths,
} from '../../shared/utils/month-series.util';

// Every query in this file aliases transactions as t.
const BUSINESS_DATE = businessDateSql('t');

const CASHFLOW_KEYS = ['income', 'expense'] as const;

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

// The region narrowing every read carries: requested region plus the caller's scope.
export interface RegionQuery {
  regionCode?: string;
  caller?: RegionScope;
}

export interface DateRangeQuery extends RegionQuery {
  from?: string;
  to?: string;
}

export interface CashflowTrendQuery extends RegionQuery {
  months?: number;
}

export interface DepositReminders {
  overdue: Transaction[];
  dueToday: Transaction[];
  dueThisWeek: Transaction[];
  dueThisMonth: Transaction[];
}

// One definition of the range clause, so a bound or a cast changes in one place.
export function applyBusinessDateRange(
  qb: SelectQueryBuilder<Transaction>,
  from?: string,
  to?: string,
): void {
  const bounds = dateRange(from, to);
  if (!bounds) {
    return;
  }
  qb.andWhere(`${BUSINESS_DATE} BETWEEN :from::date AND :to::date`, bounds);
}

@Injectable()
export class FinancialAnalyticsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async getSummary(
    companyId: string,
    query: DateRangeQuery = {},
  ): Promise<TransactionSummary> {
    const { regionCode, caller, from, to } = query;
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
      // Net computed as one numeric expression so the subtraction stays exact decimal arithmetic in SQL.
      .addSelect(
        'COALESCE(SUM(CASE WHEN t.type = :income THEN t.amount WHEN t.type = :expense THEN -t.amount ELSE 0 END), 0)',
        'net',
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

    applyBusinessDateRange(qb, from, to);

    const result = await qb.getRawOne();

    const totalIncome = Number(result?.totalIncome ?? 0);
    const totalExpense = Number(result?.totalExpense ?? 0);
    const net = Number(result?.net ?? 0);

    return {
      totalIncome,
      totalExpense,
      net,
    };
  }

  // One row per category actually present, split by type, over the given range.
  async getCategoryBreakdown(
    companyId: string,
    query: DateRangeQuery = {},
  ): Promise<CategoryTotal[]> {
    const { from, to, regionCode, caller } = query;
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
      .orderBy('total', 'DESC');

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    applyBusinessDateRange(qb, from, to);

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

  // Income and expense per month, oldest first, zero-filled so a gap does not shorten the series.
  async getCashflowTrend(
    companyId: string,
    query: CashflowTrendQuery = {},
  ): Promise<CashflowPoint[]> {
    const { months = 6, regionCode, caller } = query;
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    const series = monthSeries(months, trendAnchor(regionCodes));
    const empty = zeroFillMonths(series, [], CASHFLOW_KEYS);

    if (regionCodes?.length === 0) return empty;

    const label = monthLabelSql('t');
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(label, 'month')
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
      // Bound the business date itself, not its month: the truncated form cannot use an index.
      .andWhere(`${BUSINESS_DATE} >= :from::date`, { from: `${series[0]}-01` })
      .groupBy(label)
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

    return zeroFillMonths(series, rows, CASHFLOW_KEYS);
  }

  async getDepositReminders(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<DepositReminders> {
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
