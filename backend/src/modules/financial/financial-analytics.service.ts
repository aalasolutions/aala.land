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
  daysBetween,
  isWholeCalendarMonth,
  monthBounds,
  regionTodaySql,
} from '../../shared/utils/region-time.util';
import {
  BucketBounds,
  dateRange,
  dayBlockSeries,
  dayBucketSql,
  moneyDateSql,
  monthLabelSql,
  monthSeries,
  trendAnchor,
  zeroFillBuckets,
  zeroFillMonths,
} from '../../shared/utils/month-series.util';

// Every query in this file aliases transactions as t.
const MONEY_DATE = moneyDateSql('t');

const CASHFLOW_KEYS = ['income', 'expense'] as const;

export interface CategoryTotal {
  category: string;
  type: TransactionType;
  total: number;
}

export interface CashflowPoint extends BucketBounds {
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

export interface CashflowTrendQuery extends DateRangeQuery {
  periods?: number;
}

export interface DepositReminders {
  overdue: Transaction[];
  dueToday: Transaction[];
  dueThisWeek: Transaction[];
  dueThisMonth: Transaction[];
}

// One definition of the range clause, so a bound or a cast changes in one place.
export function applyMoneyDateRange(
  qb: SelectQueryBuilder<Transaction>,
  from?: string,
  to?: string,
  keepUndated = false,
): void {
  const bounds = dateRange(from, to);
  // A row with no money date sits in no period, ranged or not. The list keeps it, because
  // outstanding is a state of today; the money totals answer for periods and never ask for it.
  if (!keepUndated) {
    qb.andWhere(`${MONEY_DATE} IS NOT NULL`);
  }
  if (!bounds) {
    return;
  }
  const inRange = `${MONEY_DATE} BETWEEN :from::date AND :to::date`;
  qb.andWhere(
    keepUndated ? `(${inRange} OR ${MONEY_DATE} IS NULL)` : inRange,
    bounds,
  );
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
      // Pending is not money: nothing counts until it is completed.
      .where('t.companyId = :companyId AND t.status = :completed', {
        companyId,
        completed: TransactionStatus.COMPLETED,
      })
      .setParameters({
        income: TransactionType.INCOME,
        expense: TransactionType.EXPENSE,
      });

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    applyMoneyDateRange(qb, from, to);

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
      .andWhere('t.status = :completed', {
        completed: TransactionStatus.COMPLETED,
      })
      .groupBy('t.category')
      .addGroupBy('t.type')
      .orderBy('total', 'DESC');

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    applyMoneyDateRange(qb, from, to);

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

  // The last bucket is the selected range; the rest are the same width, running backwards from it.
  async getCashflowTrend(
    companyId: string,
    query: CashflowTrendQuery = {},
  ): Promise<CashflowPoint[]> {
    const { periods = 6, from, to, regionCode, caller } = query;
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    const range = dateRange(from, to);

    if (range && !isWholeCalendarMonth(range.from, range.to)) {
      const size = daysBetween(range.from, range.to) + 1;
      return this.blockCashflow(
        companyId,
        range.to,
        size,
        periods,
        regionCodes,
      );
    }
    return this.monthlyCashflow(companyId, range?.to, periods, regionCodes);
  }

  // Calendar months, oldest first, zero-filled, ending on the selected month or the current one.
  private async monthlyCashflow(
    companyId: string,
    anchorDate: string | undefined,
    periods: number,
    regionCodes: string[] | null,
  ): Promise<CashflowPoint[]> {
    const anchor = anchorDate
      ? new Date(`${anchorDate}T00:00:00Z`)
      : trendAnchor(regionCodes);
    const series = monthSeries(periods, anchor);
    const withBounds = (rows: Array<{ month: string }>) =>
      zeroFillMonths(series, rows, CASHFLOW_KEYS).map((point) => ({
        ...monthBounds(point.month),
        ...point,
      }));

    if (regionCodes?.length === 0) return withBounds([]);

    const label = monthLabelSql('t');
    const rows = await this.cashflowQuery(companyId, label, regionCodes)
      // Bound the date itself, not its month: the truncated form cannot use an index.
      .andWhere(`${MONEY_DATE} BETWEEN :seriesFrom::date AND :seriesTo::date`, {
        seriesFrom: `${series[0]}-01`,
        seriesTo: monthBounds(series[series.length - 1]).to,
      })
      .getRawMany<{ bucket: string; income: string; expense: string }>();

    return withBounds(
      rows.map(({ bucket, ...totals }) => ({ month: bucket, ...totals })),
    );
  }

  // Fixed-length day blocks, oldest first, the last one being the selected range.
  private async blockCashflow(
    companyId: string,
    rangeEnd: string,
    size: number,
    count: number,
    regionCodes: string[] | null,
  ): Promise<CashflowPoint[]> {
    const series = dayBlockSeries(rangeEnd, size, count);
    // Read back from the series, so SQL buckets on exactly the width it was built with.
    const span = daysBetween(series[0].from, series[0].to) + 1;
    if (regionCodes?.length === 0) {
      return zeroFillBuckets(series, [], CASHFLOW_KEYS);
    }

    const rows = await this.cashflowQuery(
      companyId,
      dayBucketSql('t'),
      regionCodes,
    )
      .andWhere(`${MONEY_DATE} BETWEEN :seriesFrom::date AND :seriesTo::date`)
      .setParameters({
        seriesFrom: series[0].from,
        seriesTo: series[series.length - 1].to,
        bucketSize: span,
      })
      .getRawMany<{ bucket: string; income: string; expense: string }>();

    return zeroFillBuckets(series, rows, CASHFLOW_KEYS);
  }

  // One shape for both bucketings, so a filter can never apply to only one of them.
  private cashflowQuery(
    companyId: string,
    bucket: string,
    regionCodes: string[] | null,
  ): SelectQueryBuilder<Transaction> {
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(bucket, 'bucket')
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END), 0)`,
        'income',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END), 0)`,
        'expense',
      )
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.status = :completed', {
        completed: TransactionStatus.COMPLETED,
      })
      .groupBy(bucket)
      .setParameters({
        income: TransactionType.INCOME,
        expense: TransactionType.EXPENSE,
      });

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }
    return qb;
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
