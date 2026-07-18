import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingHistoryService } from './billing-history.service';
import { BillingHistory } from './entities/billing-history.entity';
import {
  PaymentSucceededEvent,
  PaymentFailedEvent,
} from './events/billing-events';

describe('BillingHistoryService', () => {
  let service: BillingHistoryService;
  let repo: jest.Mocked<
    Pick<Repository<BillingHistory>, 'query' | 'findAndCount'>
  >;

  const occurredAt = new Date('2026-07-16T10:00:00Z');
  const base = {
    companyId: 'company-uuid-1',
    customerId: 'cus_1',
    subscriptionId: 'sub_1' as string | null,
    occurredAt,
    hostedInvoiceUrl: 'https://pay.stripe.com/invoice/in_1',
    invoicePdfUrl: 'https://pay.stripe.com/invoice/in_1/pdf',
    periodStart: new Date('2026-07-01T00:00:00Z'),
    periodEnd: new Date('2026-08-01T00:00:00Z'),
  };

  const succeeded: PaymentSucceededEvent = {
    name: 'PaymentSucceeded',
    ...base,
    amount: 2500,
    currency: 'usd',
    invoiceId: 'in_1',
  };

  const failed: PaymentFailedEvent = {
    name: 'PaymentFailed',
    ...base,
    amount: 2500,
    currency: 'usd',
    invoiceId: 'in_1',
    attemptCount: 2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingHistoryService,
        {
          provide: getRepositoryToken(BillingHistory),
          useValue: {
            query: jest.fn().mockResolvedValue([]),
            findAndCount: jest.fn().mockResolvedValue([[], 0]),
          },
        },
      ],
    }).compile();

    service = module.get(BillingHistoryService);
    repo = module.get(getRepositoryToken(BillingHistory));
  });

  describe('recordPayment', () => {
    it('upserts a payment_succeeded row keyed on (stripeInvoiceId, type) with a recency guard', async () => {
      await service.recordPayment(succeeded);
      expect(repo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('ON CONFLICT (stripe_invoice_id, type) DO UPDATE');
      // Recency guard: an older redelivery must not regress a newer row.
      expect(sql).toContain(
        'WHERE billing_history.occurred_at <= EXCLUDED.occurred_at',
      );
      expect(params).toEqual([
        'company-uuid-1',
        'in_1',
        'payment_succeeded',
        2500,
        'usd',
        base.hostedInvoiceUrl,
        base.invoicePdfUrl,
        base.periodStart,
        base.periodEnd,
        null,
        occurredAt,
      ]);
    });

    it('records payment_failed with the attempt count', async () => {
      await service.recordPayment(failed);
      const params = repo.query.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe('payment_failed');
      expect(params[9]).toBe(2); // attempt_count
    });

    it('skips (no write) when the invoice id is missing', async () => {
      await service.recordPayment({ ...succeeded, invoiceId: null });
      expect(repo.query).not.toHaveBeenCalled();
    });
  });

  describe('listBillingHistory', () => {
    it('scopes to a company when companyId is given', async () => {
      await service.listBillingHistory('company-uuid-1', 2, 10);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-uuid-1' },
          order: { occurredAt: 'DESC' },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('lists across all companies when companyId is undefined (SUPER_ADMIN)', async () => {
      await service.listBillingHistory(undefined, 1, 20);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('returns the paginated envelope', async () => {
      (repo.findAndCount as jest.Mock).mockResolvedValue([[{ id: 'x' }], 1]);
      const result = await service.listBillingHistory('company-uuid-1', 1, 20);
      expect(result).toEqual({
        data: [{ id: 'x' }],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('clamps an oversized limit and a non-positive page', async () => {
      const result = await service.listBillingHistory(undefined, 0, 1000000);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });
  });
});
