import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContactPrivacyService } from '../contacts/contact-privacy.service';
import { FinancialAnalyticsService } from './financial-analytics.service';
import { Transaction } from './entities/transaction.entity';
import { Company } from '../companies/entities/company.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Asset } from '../properties/entities/asset.entity';
import { Locality } from '../locations/entities/locality.entity';
import { City } from '../locations/entities/city.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { User } from '../users/entities/user.entity';
import {
  dayBucketSql,
  monthLabelSql,
} from '../../shared/utils/month-series.util';

interface Compiled {
  sql: string;
  params: unknown[];
}

// TypeORM quotes an alias and its column; the shared expression is written unquoted.
const quoted = (expression: string) =>
  expression.replace(/\bt\.(\w+)/g, '"t"."$1"');

const MONEY_DATE = quoted('t.transaction_date');

function boundsOf(entry: Compiled): { from: unknown; to: unknown } | null {
  const clause = entry.sql.match(/BETWEEN \$(\d+)::date AND \$(\d+)::date/);
  if (!clause) return null;
  return {
    from: entry.params[Number(clause[1]) - 1],
    to: entry.params[Number(clause[2]) - 1],
  };
}

describe('FinancialAnalyticsService', () => {
  let service: FinancialAnalyticsService;
  let dataSource: DataSource;
  let compiled: Compiled[];
  let rawOne: Record<string, string> | undefined;
  let rawMany: Record<string, string>[];

  const companyId = 'company-uuid-1';

  // A real query builder, so every clause below is SQL TypeORM actually compiled.
  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      entities: [
        Transaction,
        Company,
        Unit,
        Asset,
        Locality,
        City,
        Contact,
        User,
      ],
    });
    await (
      dataSource as unknown as { buildMetadatas: () => Promise<void> }
    ).buildMetadatas();
  });

  beforeEach(async () => {
    compiled = [];
    rawOne = { totalIncome: '15000', totalExpense: '3000', net: '12000' };
    rawMany = [];

    const repository = {
      createQueryBuilder: (alias: string) => {
        const qb = dataSource.createQueryBuilder(Transaction, alias);
        const capture = () => {
          const [sql, params] = qb.getQueryAndParameters();
          compiled.push({ sql, params });
        };
        (qb as any).getRawOne = async () => {
          capture();
          return rawOne;
        };
        (qb as any).getRawMany = async () => {
          capture();
          return rawMany;
        };
        (qb as any).getMany = async () => {
          capture();
          return [];
        };
        return qb;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialAnalyticsService,
        { provide: getRepositoryToken(Transaction), useValue: repository },
        {
          provide: ContactPrivacyService,
          useValue: { accessLevelFor: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<FinancialAnalyticsService>(FinancialAnalyticsService);
  });

  describe('getSummary', () => {
    it('returns the totals SQL produced, net included', async () => {
      const result = await service.getSummary(companyId);

      expect(result).toEqual({
        totalIncome: 15000,
        totalExpense: 3000,
        net: 12000,
      });
    });

    it('takes net from SQL rather than re-subtracting in JS', async () => {
      rawOne = {
        totalIncome: '100000.1',
        totalExpense: '12237.93',
        net: '87762.17',
      };

      const result = await service.getSummary(companyId);

      expect(result.net).toBe(87762.17);
    });

    it('returns zeros without touching SQL when no region is readable', async () => {
      const result = await service.getSummary(companyId, {
        caller: { role: 'agent', regionCodes: [] },
      });

      expect(result).toEqual({ totalIncome: 0, totalExpense: 0, net: 0 });
      expect(compiled).toHaveLength(0);
    });

    describe('date range branch', () => {
      it('builds the BETWEEN clause on the business date with the given bounds', async () => {
        await service.getSummary(companyId, {
          from: '2026-02-01',
          to: '2026-02-28',
        });

        const [entry] = compiled;
        expect(entry.sql).toContain(`${MONEY_DATE} BETWEEN $`);
        expect(boundsOf(entry)).toEqual({
          from: '2026-02-01',
          to: '2026-02-28',
        });
      });

      it('bounds the day the money arrived, never created_at', async () => {
        await service.getSummary(companyId, {
          from: '2026-02-01',
          to: '2026-02-28',
        });

        const [entry] = compiled;
        expect(entry.sql).toContain('"t"."transaction_date" BETWEEN');
        expect(entry.sql).not.toMatch(/"t"\."created_at"/);
      });

      // Ranged or not, the money totals answer for periods, so a row in none is in neither answer.
      it('excludes undated rows whether or not a range is given', async () => {
        await service.getSummary(companyId);
        const [unranged] = compiled;
        expect(unranged.sql).toContain('"t"."transaction_date" IS NOT NULL');

        compiled.length = 0;
        await service.getSummary(companyId, {
          from: '2026-02-01',
          to: '2026-02-28',
        });
        const [ranged] = compiled;
        expect(ranged.sql).toContain('"t"."transaction_date" IS NOT NULL');
      });

      it('omits the clause entirely when no range is given', async () => {
        await service.getSummary(companyId);

        const [entry] = compiled;
        expect(entry.sql).not.toContain('BETWEEN');
        expect(boundsOf(entry)).toBeNull();
        expect(entry.params).toEqual([
          'INCOME',
          'EXPENSE',
          companyId,
          'COMPLETED',
        ]);
      });

      it('keeps the range and the region filter together', async () => {
        await service.getSummary(companyId, {
          from: '2026-02-01',
          to: '2026-02-28',
          regionCode: 'dubai',
        });

        const [entry] = compiled;
        expect(entry.params).toEqual([
          'INCOME',
          'EXPENSE',
          companyId,
          'COMPLETED',
          'dubai',
          '2026-02-01',
          '2026-02-28',
        ]);
        expect(entry.sql).toContain('"t"."region_code" IN ($5)');
      });

      it('sorts a reversed range into ascending bounds', async () => {
        await service.getSummary(companyId, {
          from: '2026-02-28',
          to: '2026-02-01',
        });

        expect(boundsOf(compiled[0])).toEqual({
          from: '2026-02-01',
          to: '2026-02-28',
        });
      });

      it('rejects a half range and an unreal date before SQL is built', async () => {
        await expect(
          service.getSummary(companyId, { from: '2026-02-01' }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.getSummary(companyId, {
            from: '2026-02-31',
            to: '2026-03-01',
          }),
        ).rejects.toThrow(BadRequestException);

        expect(compiled).toHaveLength(0);
      });
    });
  });

  // Money is money once it is in the bank: pending is not profit and not an expense.
  describe('only completed money counts', () => {
    it.each([
      ['getSummary', () => service.getSummary(companyId)],
      ['getCategoryBreakdown', () => service.getCategoryBreakdown(companyId)],
      ['getCashflowTrend', () => service.getCashflowTrend(companyId)],
    ])('%s counts COMPLETED rows only', async (_name, run) => {
      await run();

      const [entry] = compiled;
      expect(entry.sql).toContain('"t"."status" = $');
      expect(entry.params).toContain('COMPLETED');
      expect(entry.params).not.toContain('PENDING');
    });
  });

  describe('getCategoryBreakdown', () => {
    it('bounds the same business date and returns one row per category', async () => {
      rawMany = [
        { category: 'RENT', type: 'INCOME', total: '15000' },
        {
          category: null as unknown as string,
          type: 'EXPENSE',
          total: '250.5',
        },
      ];

      const result = await service.getCategoryBreakdown(companyId, {
        from: '2026-01-01',
        to: '2026-03-31',
      });

      expect(result).toEqual([
        { category: 'RENT', type: 'INCOME', total: 15000 },
        { category: 'OTHER', type: 'EXPENSE', total: 250.5 },
      ]);
      const [entry] = compiled;
      expect(entry.sql).toContain(`${MONEY_DATE} BETWEEN $`);
      expect(boundsOf(entry)).toEqual({
        from: '2026-01-01',
        to: '2026-03-31',
      });
    });
  });

  describe('getCashflowTrend', () => {
    const boundary = new Date('2026-09-30T21:00:00.000Z');

    afterEach(() => {
      jest.useRealTimers();
    });

    it('zero-fills every month of the series and bounds on the whole span', async () => {
      jest.useFakeTimers().setSystemTime(boundary);
      rawMany = [{ bucket: '2026-10', income: '5000', expense: '1200.25' }];

      const result = await service.getCashflowTrend(companyId, { periods: 6 });

      expect(result.map((point) => point.month)).toEqual([
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
      expect(result[result.length - 1]).toEqual({
        month: '2026-10',
        from: '2026-10-01',
        to: '2026-10-31',
        income: 5000,
        expense: 1200.25,
      });
      const [entry] = compiled;
      expect(boundsOf(entry)).toEqual({
        from: '2026-05-01',
        to: '2026-10-31',
      });
      expect(entry.sql).toContain(quoted(monthLabelSql('t')));
    });

    it('returns the zero-filled series without touching SQL when no region is readable', async () => {
      jest.useFakeTimers().setSystemTime(boundary);

      const result = await service.getCashflowTrend(companyId, {
        periods: 3,
        caller: { role: 'agent', regionCodes: [] },
      });

      // No readable region leaves only the UTC fallback, which is still in September.
      expect(result.map((point) => point.month)).toEqual([
        '2026-07',
        '2026-08',
        '2026-09',
      ]);
      expect(compiled).toHaveLength(0);
    });

    it('groups on the block index and bounds the series when the range is not a month', async () => {
      rawMany = [{ bucket: '5', income: '750', expense: '0' }];

      const result = await service.getCashflowTrend(companyId, {
        periods: 6,
        from: '2026-09-15',
        to: '2026-09-21',
      });

      expect(result[5]).toEqual({
        from: '2026-09-15',
        to: '2026-09-21',
        income: 750,
        expense: 0,
      });
      const [entry] = compiled;
      const bucketSql = quoted(dayBucketSql('t'))
        .replace(':seriesFrom', '$1')
        .replace(':bucketSize', '$2');
      expect(entry.sql).toContain(`${bucketSql} AS "bucket"`);
      expect(entry.sql).toContain(`GROUP BY ${bucketSql}`);
      expect(boundsOf(entry)).toEqual({
        from: '2026-08-11',
        to: '2026-09-21',
      });
      expect(entry.params).toContain(7);
    });
  });
});
