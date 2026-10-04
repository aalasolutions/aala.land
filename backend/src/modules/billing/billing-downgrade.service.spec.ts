import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  BillingDowngradeService,
  DOWNGRADE_DELAY_MS,
  DROP_REASONS,
  MAX_PROVIDER_ATTEMPTS,
  REFUND_WINDOW_MS,
  RENEWAL_WAIT_MS,
} from './billing-downgrade.service';
import { AuditService } from '../audit/audit.service';
import { BillingHistoryService } from './billing-history.service';
import { BillingNotices } from './events/billing-notices';
import { RefundUpdatedEvent } from './events/billing-events';
import {
  BILLING_PROVIDER,
  RefundBasis,
} from './provider/billing-provider.interface';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { PaymentRemedy } from '../console/entities/payment-remedy.entity';
import { BillingHistory } from './entities/billing-history.entity';

const companyId = 'company-1';
const now = new Date('2026-10-13T00:00:00.000Z');
const requestedAt = new Date(now.getTime() - DOWNGRADE_DELAY_MS - 60000);

const basis: RefundBasis = {
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
  periodStart: new Date('2026-10-01T00:00:00.000Z'),
  periodEnd: new Date('2026-10-31T00:00:00.000Z'),
  heldLines: [{ quantity: 1, unitGross: 3000 }],
  pendingNextBill: -500,
  pendingNextBillKnown: true,
  creditBalance: 0,
};

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: companyId,
    billingCustomerId: 'ctm_1',
    billingSubscriptionId: 'sub_1',
    downgradeRequestedAt: requestedAt,
    downgradeRequestedBy: 'user-1',
    downgradeSubscriptionId: 'sub_1',
    downgradeAttempts: 0,
    ...overrides,
  } as Company;
}

function payment(id: string, amount: number, occurredAt: string) {
  return {
    id,
    companyId,
    providerInvoiceId: `txn_${id}`,
    type: 'payment_succeeded',
    amount,
    currency: 'usd',
    occurredAt: new Date(occurredAt),
  } as BillingHistory;
}

function plannedRow(id: string, amount: number, historyId: string) {
  return {
    ...queuedRow(id, amount, historyId),
    breakdown: { periodStart: basis.periodStart.toISOString() },
  } as PaymentRemedy;
}

function queuedRow(id: string, amount: number, historyId: string) {
  return {
    id,
    companyId,
    amount,
    currency: 'usd',
    billingHistoryId: historyId,
    status: 'queued',
    cause: 'cancel',
    attempts: 0,
  } as PaymentRemedy;
}

describe('BillingDowngradeService', () => {
  let service: BillingDowngradeService;
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let companyRepo: { query: jest.Mock; update: jest.Mock };
  let remedyRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let provider: {
    getRefundBasis: jest.Mock;
    cancelImmediately: jest.Mock;
    refundInvoicePayment: jest.Mock;
    getCancellationState: jest.Mock;
    resume: jest.Mock;
    getPeriodPayments: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let history: { recordRefund: jest.Mock; setRefundStatus: jest.Mock };
  let plainManager: { findOne: jest.Mock };
  let emit: jest.SpyInstance;

  // Company, then queued rows, then payments and earlier refunds, as the service reads them.
  function given(opts: {
    company?: Company | null;
    queued?: PaymentRemedy[];
    payments?: BillingHistory[];
    priorRefunds?: Partial<PaymentRemedy>[];
    activeUsers?: number;
    /** Rows recorded for the provider's current period; paid by default. */
    periodRows?: { type: string }[];
  }) {
    manager.findOne.mockResolvedValue(
      opts.company === undefined ? company() : opts.company,
    );
    manager.find.mockImplementation(
      (entity: unknown, options?: { where?: { type?: unknown } }) => {
        if (entity === BillingHistory) {
          // The payments query names one type; the period query names several.
          return Promise.resolve(
            typeof options?.where?.type === 'string'
              ? (opts.payments ?? [])
              : (opts.periodRows ?? [{ type: 'payment_succeeded' }]),
          );
        }
        if (entity === PaymentRemedy) {
          return Promise.resolve(
            manager.find.mock.calls.filter((c) => c[0] === PaymentRemedy)
              .length === 1
              ? (opts.queued ?? [])
              : (opts.priorRefunds ?? []),
          );
        }
        return Promise.resolve([]);
      },
    );
    manager.count.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === User ? (opts.activeUsers ?? 1) : (opts.queued ?? []).length,
      ),
    );
  }

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(() => ({ update: manager.update })),
    };
    plainManager = {
      findOne: jest.fn((_entity: unknown, opts: { where: { id: string } }) =>
        Promise.resolve({ providerInvoiceId: `txn_${opts.where.id}` }),
      ),
    };
    companyRepo = {
      query: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    remedyRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((row: Partial<PaymentRemedy>) => row),
      save: jest.fn((rows: Partial<PaymentRemedy>[]) =>
        Promise.resolve(rows.map((r, i) => ({ ...r, id: `rem-${i + 1}` }))),
      ),
    };
    provider = {
      getRefundBasis: jest.fn().mockResolvedValue(basis),
      cancelImmediately: jest.fn().mockResolvedValue(undefined),
      refundInvoicePayment: jest.fn((invoiceId: string) =>
        Promise.resolve({ refundId: `adj_${invoiceId}`, state: 'pending' }),
      ),
      getCancellationState: jest
        .fn()
        .mockResolvedValue({ cancelAtPeriodEnd: false, cancelAt: null }),
      resume: jest.fn().mockResolvedValue(undefined),
      getPeriodPayments: jest
        .fn()
        .mockResolvedValue({ paid: false, failed: false, cardPayments: [] }),
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    history = {
      recordRefund: jest.fn().mockResolvedValue(undefined),
      setRefundStatus: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingDowngradeService,
        BillingNotices,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(PaymentRemedy), useValue: remedyRepo },
        { provide: BILLING_PROVIDER, useValue: provider },
        { provide: BillingHistoryService, useValue: history },
        { provide: AuditService, useValue: audit },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) =>
              cb(manager),
            ),
            manager: plainManager,
          },
        },
      ],
    }).compile();
    service = module.get(BillingDowngradeService);
    emit = jest.spyOn(module.get(BillingNotices), 'emit');
  });

  describe('request', () => {
    it('records the time, user and subscription under the company lock and sends the notice', async () => {
      given({ company: company({ downgradeRequestedAt: null }) });
      const result = await service.request(companyId, 'sub_1', 'user-1');

      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [companyId],
      );
      const patch = manager.update.mock.calls[0][2];
      expect(patch).toEqual({
        downgradeRequestedAt: expect.any(Date),
        downgradeRequestedBy: 'user-1',
        downgradeSubscriptionId: 'sub_1',
        downgradeAttempts: 0,
      });
      const at = patch.downgradeRequestedAt as Date;
      expect(result).toEqual({
        downgradeRequestedAt: at.toISOString(),
        downgradeEffectiveAt: new Date(
          at.getTime() + 48 * 3600 * 1000,
        ).toISOString(),
      });
      expect(emit).toHaveBeenCalledWith('DowngradeRequested', {
        companyId,
        effectiveAt: new Date(at.getTime() + DOWNGRADE_DELAY_MS),
      });
    });

    it('returns the pending request unchanged on a repeat call', async () => {
      given({});
      const result = await service.request(companyId, 'sub_1', 'user-2');
      expect(manager.update).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(result).toEqual({
        downgradeRequestedAt: requestedAt.toISOString(),
        downgradeEffectiveAt: new Date(
          requestedAt.getTime() + DOWNGRADE_DELAY_MS,
        ).toISOString(),
      });
    });

    it('refuses a new request while an earlier refund is still queued', async () => {
      given({
        company: company({ downgradeRequestedAt: null }),
        queued: [queuedRow('rem-old', 100, 'h1')],
      });
      await expect(
        service.request(companyId, 'sub_1', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('returns false when nothing is pending', async () => {
      given({ company: company({ downgradeRequestedAt: null }) });
      await expect(service.withdraw(companyId)).resolves.toBe(false);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('clears the pending request', async () => {
      given({});
      await expect(service.withdraw(companyId)).resolves.toBe(true);
      expect(manager.update).toHaveBeenCalledWith(Company, companyId, {
        downgradeRequestedAt: null,
        downgradeRequestedBy: null,
        downgradeSubscriptionId: null,
        downgradeAttempts: 0,
      });
    });

    it('refuses once execution has queued the refund', async () => {
      given({ queued: [queuedRow('rem-1', 100, 'h1')] });
      await expect(service.withdraw(companyId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('executeDue', () => {
    it('selects requests older than the delay and companies with queued refunds', async () => {
      await service.executeDue(now);
      const [sql, params] = companyRepo.query.mock.calls[0];
      expect(sql).toContain('downgrade_requested_at <= $1');
      expect(sql).toContain("cause = 'cancel' AND status = 'queued'");
      expect(params).toEqual([new Date(now.getTime() - DOWNGRADE_DELAY_MS)]);
    });

    it('carries on with the next company when one fails', async () => {
      companyRepo.query.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      const run = jest
        .spyOn(service, 'executeFor')
        .mockRejectedValueOnce(new Error('provider down'))
        .mockResolvedValueOnce(undefined);
      await expect(service.executeDue(now)).resolves.toBeUndefined();
      expect(run).toHaveBeenCalledWith('a', now);
      expect(run).toHaveBeenCalledWith('b', now);
    });
  });

  describe('executeFor', () => {
    it('plans the refund, cancels at once, then refunds and records it', async () => {
      // 20 of 30 days unused: 3000 x 2/3 = 2000, plus 500 held credit = 2500.
      const order: string[] = [];
      remedyRepo.save.mockImplementation((rows: Partial<PaymentRemedy>[]) => {
        order.push('plan');
        return Promise.resolve(
          rows.map((r, i) => ({ ...r, id: `rem-${i + 1}` })),
        );
      });
      provider.cancelImmediately.mockImplementation(() => {
        order.push('cancel');
        return Promise.resolve();
      });
      provider.refundInvoicePayment.mockImplementation((invoiceId: string) => {
        order.push('refund');
        return Promise.resolve({
          refundId: `adj_${invoiceId}`,
          state: 'pending',
        });
      });
      given({
        company: company({
          downgradeRequestedAt: new Date('2026-10-08T00:00:00Z'),
        }),
        payments: [
          payment('h-new', 1000, '2026-10-05T00:00:00Z'),
          payment('h-old', 3000, '2026-10-01T00:00:00Z'),
        ],
        priorRefunds: [{ billingHistoryId: 'h-old', amount: 200 }],
      });

      await service.executeFor(companyId, new Date('2026-10-11T00:00:00Z'));

      expect(order).toEqual(['plan', 'cancel', 'refund', 'refund']);
      const historyQuery = manager.find.mock.calls.find(
        (c) => c[0] === BillingHistory && typeof c[1].where.type === 'string',
      )![1];
      expect(historyQuery.where.companyId).toBe(companyId);
      expect(historyQuery.where.type).toBe('payment_succeeded');
      const saved = remedyRepo.save.mock.calls[0][0] as PaymentRemedy[];
      expect(saved.map((r) => [r.billingHistoryId, r.amount])).toEqual([
        ['h-new', 1000],
        ['h-old', 1500],
      ]);
      expect(saved[0]).toMatchObject({
        companyId,
        kind: 'refund',
        status: 'queued',
        cause: 'cancel',
        paymentSource: 'card',
        createdBy: null,
        createdByEmail: null,
      });
      expect(saved[0].breakdown).toMatchObject({
        amount: 2500,
        cardRefundable: 3800,
        pendingNextBill: -500,
        pendingNextBillKnown: true,
        creditBalance: 0,
        creditReturned: 0,
        subscriptionId: 'sub_1',
      });
      expect(provider.cancelImmediately).toHaveBeenCalledWith({
        subscriptionId: 'sub_1',
        customerId: 'ctm_1',
      });
      expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
        downgradeRequestedAt: null,
        downgradeRequestedBy: null,
        downgradeSubscriptionId: null,
        downgradeAttempts: 0,
      });
      expect(provider.refundInvoicePayment).toHaveBeenCalledWith(
        'txn_h-new',
        1000,
        'rem-1',
      );
      expect(history.recordRefund).toHaveBeenCalledWith({
        companyId,
        refundId: 'adj_txn_h-new',
        amount: 1000,
        currency: 'usd',
        refundStatus: 'pending',
        occurredAt: expect.any(Date),
      });
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-1', companyId, status: 'queued' },
        { providerRef: 'adj_txn_h-new', status: 'initiated', lastError: null },
      );
      expect(emit).toHaveBeenCalledWith('RefundRequested', {
        companyId,
        amount: 2500,
        currency: 'usd',
      });
    });

    it('does nothing before the delay has passed', async () => {
      given({ company: company({ downgradeRequestedAt: now }) });
      await service.executeFor(companyId, now);
      expect(provider.getRefundBasis).not.toHaveBeenCalled();
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
    });

    it('withdraws the request when the team has grown past one active user', async () => {
      given({ activeUsers: 2 });
      await service.executeFor(companyId, now);
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
      expect(companyRepo.update).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ downgradeRequestedAt: null }),
      );
    });

    it('withdraws the request when its subscription is no longer current', async () => {
      given({ company: company({ billingSubscriptionId: 'sub_new' }) });
      await service.executeFor(companyId, now);
      expect(provider.getRefundBasis).not.toHaveBeenCalled();
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
      expect(companyRepo.update).toHaveBeenCalled();
    });

    it('withdraws the request when the provider already ended the subscription', async () => {
      provider.getRefundBasis.mockResolvedValue(null);
      given({});
      await service.executeFor(companyId, now);
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
      expect(remedyRepo.save).not.toHaveBeenCalled();
    });

    it('cancels without a refund when nothing was paid by card', async () => {
      given({ payments: [] });
      await service.executeFor(companyId, now);
      expect(remedyRepo.save).not.toHaveBeenCalled();
      expect(provider.cancelImmediately).toHaveBeenCalled();
      expect(provider.refundInvoicePayment).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('keeps the planned refund and the request and counts the attempt when the cancel fails', async () => {
      provider.cancelImmediately.mockRejectedValue(new Error('provider down'));
      given({ payments: [payment('h1', 3000, '2026-10-01T00:00:00Z')] });
      await service.executeFor(companyId, now);
      expect(remedyRepo.save).toHaveBeenCalled();
      expect(companyRepo.update).toHaveBeenCalledTimes(1);
      expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
        downgradeAttempts: 1,
      });
      expect(provider.refundInvoicePayment).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('releases the request and the planned refunds after the last failed cancel, tells the customer and audits it', async () => {
      provider.cancelImmediately.mockRejectedValue(new Error('provider down'));
      given({
        company: company({ downgradeAttempts: MAX_PROVIDER_ATTEMPTS - 1 }),
        queued: [queuedRow('rem-1', 700, 'h1')],
      });
      await service.executeFor(companyId, now);
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-1', companyId, status: 'queued' },
        {
          status: 'failed',
          attempts: MAX_PROVIDER_ATTEMPTS,
          lastError: 'provider down',
        },
      );
      expect(companyRepo.update).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ downgradeRequestedAt: null }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          entityType: 'ConsoleRemedy',
          newValue: expect.objectContaining({
            event: 'downgrade_released',
            error: 'provider down',
            operator: 'system',
          }),
        }),
      );
      expect(emit).toHaveBeenCalledWith('DowngradeCancelled', {
        companyId,
        reason: DROP_REASONS.cancelFailed,
      });
      expect(provider.refundInvoicePayment).not.toHaveBeenCalled();
    });

    it('goes on with the refund when the last cancel errored but the provider did end it', async () => {
      provider.cancelImmediately.mockRejectedValue(new Error('timed out'));
      provider.getRefundBasis.mockResolvedValue(null);
      given({
        company: company({ downgradeAttempts: MAX_PROVIDER_ATTEMPTS - 1 }),
        queued: [queuedRow('rem-1', 700, 'h1')],
      });
      await service.executeFor(companyId, now);
      expect(provider.refundInvoicePayment).toHaveBeenCalledWith(
        'txn_h1',
        700,
        'rem-1',
      );
      expect(emit).not.toHaveBeenCalledWith(
        'DowngradeCancelled',
        expect.anything(),
      );
    });

    it('on a retry reuses the planned rows and repeats only the cancel and the refund', async () => {
      given({ queued: [plannedRow('rem-1', 700, 'h1')] });
      await service.executeFor(companyId, now);
      expect(provider.getRefundBasis).toHaveBeenCalledTimes(1);
      expect(remedyRepo.save).not.toHaveBeenCalled();
      expect(provider.cancelImmediately).toHaveBeenCalledWith({
        subscriptionId: 'sub_1',
        customerId: 'ctm_1',
      });
      expect(provider.refundInvoicePayment).toHaveBeenCalledWith(
        'txn_h1',
        700,
        'rem-1',
      );
    });

    it('only sends queued refunds once the cancel is done', async () => {
      given({
        company: company({
          downgradeRequestedAt: null,
          downgradeSubscriptionId: null,
          billingSubscriptionId: null,
        }),
        queued: [queuedRow('rem-1', 700, 'h1')],
      });
      await service.executeFor(companyId, now);
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
      expect(provider.refundInvoicePayment).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('RefundRequested', {
        companyId,
        amount: 700,
        currency: 'usd',
      });
    });

    it('leaves a failed refund queued and still sends the others', async () => {
      provider.refundInvoicePayment
        .mockRejectedValueOnce(new Error('too old'))
        .mockResolvedValueOnce({ refundId: 'adj_2', state: 'pending' });
      given({
        company: company({ downgradeRequestedAt: null }),
        queued: [queuedRow('rem-1', 700, 'h1'), queuedRow('rem-2', 300, 'h2')],
      });
      await service.executeFor(companyId, now);
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-1', companyId, status: 'queued' },
        { attempts: 1, lastError: 'too old' },
      );
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-2', companyId, status: 'queued' },
        { providerRef: 'adj_2', status: 'initiated', lastError: null },
      );
      expect(audit.log).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('RefundRequested', {
        companyId,
        amount: 300,
        currency: 'usd',
      });
    });

    it('takes the state of a refund found again on a retry', async () => {
      provider.refundInvoicePayment.mockResolvedValue({
        refundId: 'adj_1',
        state: 'approved',
      });
      given({
        company: company({ downgradeRequestedAt: null }),
        queued: [queuedRow('rem-1', 700, 'h1')],
      });
      await service.executeFor(companyId, now);
      expect(history.recordRefund).toHaveBeenCalledWith(
        expect.objectContaining({ refundStatus: 'approved' }),
      );
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-1', companyId, status: 'queued' },
        { providerRef: 'adj_1', status: 'approved', lastError: null },
      );
      expect(emit).toHaveBeenCalledWith('RefundSettled', {
        companyId,
        amount: 700,
        currency: 'usd',
        state: 'approved',
      });
    });

    it('records the history row before moving the remedy, so a crash between repeats safely', async () => {
      const order: string[] = [];
      history.recordRefund.mockImplementation(() => {
        order.push('history');
        return Promise.resolve();
      });
      remedyRepo.update.mockImplementation(() => {
        order.push('remedy');
        return Promise.resolve({ affected: 1 });
      });
      given({
        company: company({ downgradeRequestedAt: null }),
        queued: [queuedRow('rem-1', 700, 'h1')],
      });
      await service.executeFor(companyId, now);
      expect(order).toEqual(['history', 'remedy']);
    });
  });

  describe('executeFor: credit, refund window and renewals', () => {
    const savedRows = () =>
      (remedyRepo.save.mock.calls[0][0] as PaymentRemedy[]).map((r) => [
        r.billingHistoryId,
        r.amount,
      ]);

    it('3 seats paid, 2 removed into 5000 credit, downgrade on day 12: unused seat share plus the credit, within 7500', async () => {
      const start = new Date('2026-10-03T20:11:40.283Z');
      provider.getRefundBasis.mockResolvedValue({
        startedAt: start,
        periodStart: start,
        periodEnd: new Date('2026-11-03T20:11:40.283Z'),
        heldLines: [{ quantity: 1, unitGross: 2500 }],
        pendingNextBill: 0,
        pendingNextBillKnown: true,
        creditBalance: 5000,
      });
      given({
        company: company({
          downgradeRequestedAt: new Date(start.getTime() + 9 * 86400000),
        }),
        payments: [payment('h1', 7500, '2026-10-03T20:11:40Z')],
      });
      await service.executeFor(
        companyId,
        new Date(start.getTime() + 12 * 86400000),
      );
      expect(savedRows()).toEqual([['h1', 6532]]);
      const breakdown = (remedyRepo.save.mock.calls[0][0] as PaymentRemedy[])[0]
        .breakdown;
      expect(breakdown).toMatchObject({
        unusedHeldValue: 1532,
        creditBalance: 5000,
        creditReturned: 5000,
        cardRefundable: 7500,
        amount: 6532,
      });
    });

    it('a month paid wholly from credit returns its unused share and the balance against the month-one payment', async () => {
      provider.getRefundBasis.mockResolvedValue({
        startedAt: new Date('2026-10-01T00:00:00Z'),
        periodStart: new Date('2026-11-01T00:00:00Z'),
        periodEnd: new Date('2026-12-01T00:00:00Z'),
        heldLines: [{ quantity: 1, unitGross: 2500 }],
        pendingNextBill: 0,
        pendingNextBillKnown: true,
        creditBalance: 2500,
      });
      given({
        company: company({
          downgradeRequestedAt: new Date('2026-11-13T00:00:00Z'),
        }),
        payments: [payment('month-one', 7500, '2026-10-01T00:00:00Z')],
      });
      await service.executeFor(companyId, new Date('2026-11-16T00:00:00Z'));
      expect(savedRows()).toEqual([['month-one', 1250 + 2500]]);
    });

    it('reads only payments of this subscription inside the refund window, less live refunds', async () => {
      given({ payments: [payment('h1', 3000, '2026-10-01T00:00:00Z')] });
      await service.executeFor(companyId, now);
      const where = manager.find.mock.calls.find(
        (c) => c[0] === BillingHistory && typeof c[1].where.type === 'string',
      )![1].where;
      expect(where.type).toBe('payment_succeeded');
      expect(where.periodStart.value).toEqual(basis.startedAt);
      expect(where.occurredAt.value).toEqual(
        new Date(now.getTime() - REFUND_WINDOW_MS),
      );
      const refundsWhere = manager.find.mock.calls.filter(
        (c) => c[0] === PaymentRemedy,
      )[1][1].where as { status: unknown; companyId: string }[];
      for (const clause of refundsWhere) {
        expect(clause.companyId).toBe(companyId);
        expect(clause.status).toEqual(In(['queued', 'initiated', 'approved']));
      }
    });

    it('never plans more than the refundable card money, whatever the credit', async () => {
      provider.getRefundBasis.mockResolvedValue({
        ...basis,
        creditBalance: 50000,
      });
      given({
        payments: [
          payment('h-new', 1000, '2026-10-05T00:00:00Z'),
          payment('h-old', 3000, '2026-10-01T00:00:00Z'),
        ],
        priorRefunds: [{ billingHistoryId: 'h-old', amount: 2500 }],
      });
      await service.executeFor(companyId, now);
      expect(savedRows()).toEqual([
        ['h-new', 1000],
        ['h-old', 500],
      ]);
    });

    it('waits while the renewal of the current period is not recorded yet', async () => {
      given({
        periodRows: [],
        payments: [payment('h1', 3000, '2026-09-01T00:00:00Z')],
      });
      await service.executeFor(companyId, now);
      expect(remedyRepo.save).not.toHaveBeenCalled();
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('runs once the renewal wait has passed, with no unused share for the unrecorded period', async () => {
      given({
        company: company({
          downgradeRequestedAt: new Date(
            now.getTime() - DOWNGRADE_DELAY_MS - RENEWAL_WAIT_MS - 1,
          ),
        }),
        periodRows: [],
        payments: [payment('h1', 3000, '2026-09-01T00:00:00Z')],
      });
      await service.executeFor(companyId, now);
      expect(provider.cancelImmediately).toHaveBeenCalled();
      // Only the 500 credit held for the next bill comes back.
      expect(savedRows()).toEqual([['h1', 500]]);
    });

    describe('payment for the current period not recorded by the ceiling', () => {
      const pastCeiling = () =>
        company({ downgradeRequestedAt: new Date('2026-10-01T00:00:00Z') });
      const at = new Date('2026-10-11T00:00:00Z');

      it('asks the provider and refunds the unused share against the renewal it shows paid', async () => {
        provider.getPeriodPayments.mockResolvedValue({
          paid: true,
          failed: false,
          cardPayments: [
            {
              invoiceId: 'txn_renewal',
              amount: 3000,
              currency: 'usd',
              occurredAt: new Date('2026-10-01T00:00:00Z'),
            },
          ],
        });
        given({
          company: pastCeiling(),
          periodRows: [],
          payments: [payment('h-old', 3000, '2026-09-01T00:00:00Z')],
        });
        await service.executeFor(companyId, at);
        expect(provider.getPeriodPayments).toHaveBeenCalledWith(
          { subscriptionId: 'sub_1', customerId: 'ctm_1' },
          basis.periodStart,
        );
        const rows = remedyRepo.save.mock.calls[0][0] as PaymentRemedy[];
        expect(
          rows.map((r) => [r.billingHistoryId, r.providerInvoiceId, r.amount]),
        ).toEqual([[null, 'txn_renewal', 2500]]);
        expect(rows[0].breakdown).toMatchObject({
          periodPaid: true,
          periodPaidSource: 'provider',
          unusedHeldValue: 2000,
        });
        expect(provider.refundInvoicePayment).toHaveBeenCalledWith(
          'txn_renewal',
          2500,
          'rem-1',
        );
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            newValue: expect.objectContaining({
              event: 'downgrade_executed',
              periodPaid: true,
              periodPaidSource: 'provider',
            }),
          }),
        );
      });

      it('keeps the unused share at zero when the provider shows the period unpaid', async () => {
        provider.getPeriodPayments.mockResolvedValue({
          paid: false,
          failed: true,
          cardPayments: [],
        });
        given({
          company: pastCeiling(),
          periodRows: [],
          payments: [payment('h-old', 3000, '2026-09-01T00:00:00Z')],
        });
        await service.executeFor(companyId, at);
        const rows = remedyRepo.save.mock.calls[0][0] as PaymentRemedy[];
        expect(rows.map((r) => [r.providerInvoiceId, r.amount])).toEqual([
          ['txn_h-old', 500],
        ]);
        expect(rows[0].breakdown).toMatchObject({
          periodPaid: false,
          periodPaidSource: 'provider',
        });
      });

      it('never asks the provider when our rows already decide', async () => {
        given({ payments: [payment('h1', 3000, '2026-10-01T00:00:00Z')] });
        await service.executeFor(companyId, now);
        expect(provider.getPeriodPayments).not.toHaveBeenCalled();
        expect(
          (remedyRepo.save.mock.calls[0][0] as PaymentRemedy[])[0].breakdown,
        ).toMatchObject({ periodPaidSource: 'records' });
      });

      it('counts a refund made on the provider transaction against its history row that arrives later', async () => {
        given({
          payments: [payment('h-late', 3000, '2026-10-01T00:00:00Z')],
          priorRefunds: [
            {
              billingHistoryId: null,
              providerInvoiceId: 'txn_h-late',
              amount: 2500,
            },
          ],
        });
        await service.executeFor(companyId, now);
        const rows = remedyRepo.save.mock.calls[0][0] as PaymentRemedy[];
        expect(rows.map((r) => [r.providerInvoiceId, r.amount])).toEqual([
          ['txn_h-late', 500],
        ]);
      });
    });

    it('a renewal that failed inside the window refunds nothing for the unpaid period', async () => {
      given({
        periodRows: [{ type: 'payment_failed' }],
        payments: [payment('h1', 3000, '2026-09-01T00:00:00Z')],
      });
      await service.executeFor(companyId, now);
      const breakdown = (remedyRepo.save.mock.calls[0][0] as PaymentRemedy[])[0]
        .breakdown;
      expect(breakdown).toMatchObject({
        periodPaid: false,
        unusedHeldValue: 0,
        amount: 500,
      });
      expect(provider.cancelImmediately).toHaveBeenCalled();
    });

    it('a past-due company refunds no unused share even without a failed row', async () => {
      given({
        company: company({ billingStatus: 'past_due' }),
        periodRows: [],
        payments: [payment('h1', 3000, '2026-09-01T00:00:00Z')],
      });
      await service.executeFor(companyId, now);
      expect(savedRows()).toEqual([['h1', 500]]);
    });

    it('a normal renewal still refunds its unused share', async () => {
      given({
        company: company({
          downgradeRequestedAt: new Date('2026-10-08T00:00:00Z'),
        }),
        periodRows: [{ type: 'payment_failed' }, { type: 'payment_succeeded' }],
        payments: [payment('h1', 3000, '2026-10-01T00:00:00Z')],
      });
      await service.executeFor(companyId, new Date('2026-10-11T00:00:00Z'));
      expect(savedRows()).toEqual([['h1', 2500]]);
    });

    it('clears a cancel scheduled at the provider before planning, and records an unknown next bill', async () => {
      provider.getCancellationState.mockResolvedValue({
        cancelAtPeriodEnd: true,
        cancelAt: basis.periodEnd,
      });
      provider.getRefundBasis.mockResolvedValue({
        ...basis,
        pendingNextBill: 0,
        pendingNextBillKnown: false,
      });
      given({ payments: [payment('h1', 3000, '2026-10-01T00:00:00Z')] });
      await service.executeFor(companyId, now);
      expect(provider.resume).toHaveBeenCalledWith({
        subscriptionId: 'sub_1',
        customerId: 'ctm_1',
      });
      expect(provider.resume.mock.invocationCallOrder[0]).toBeLessThan(
        provider.getRefundBasis.mock.invocationCallOrder[0],
      );
      expect(
        (remedyRepo.save.mock.calls[0][0] as PaymentRemedy[])[0].breakdown,
      ).toMatchObject({ pendingNextBillKnown: false, pendingNextBill: 0 });
    });
  });

  describe('executeFor: dropped requests and given-up refunds', () => {
    it('tells the customer when the team grew past one active user', async () => {
      given({ activeUsers: 3 });
      await service.executeFor(companyId, now);
      expect(emit).toHaveBeenCalledWith('DowngradeCancelled', {
        companyId,
        reason: DROP_REASONS.teamGrew,
      });
    });

    it('tells the customer when another subscription replaced the one requested', async () => {
      given({ company: company({ billingSubscriptionId: 'sub_new' }) });
      await service.executeFor(companyId, now);
      expect(emit).toHaveBeenCalledWith('DowngradeCancelled', {
        companyId,
        reason: DROP_REASONS.subscriptionChanged,
      });
    });

    it('stays silent when the subscription is gone, since no plan continues', async () => {
      given({ company: company({ billingSubscriptionId: null }) });
      await service.executeFor(companyId, now);
      expect(emit).not.toHaveBeenCalled();
      expect(companyRepo.update).toHaveBeenCalled();
    });

    it('gives a refund up after the last attempt, records the error and audits it', async () => {
      provider.refundInvoicePayment.mockRejectedValue(
        new Error('transaction too old'),
      );
      given({
        company: company({ downgradeRequestedAt: null }),
        queued: [
          {
            ...queuedRow('rem-1', 700, 'h1'),
            attempts: MAX_PROVIDER_ATTEMPTS - 1,
          } as PaymentRemedy,
        ],
      });
      await service.executeFor(companyId, now);
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-1', companyId, status: 'queued' },
        {
          status: 'failed',
          attempts: MAX_PROVIDER_ATTEMPTS,
          lastError: 'transaction too old',
        },
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          entityType: 'ConsoleRemedy',
          newValue: expect.objectContaining({
            event: 'refund_failed',
            remedyId: 'rem-1',
            amount: 700,
            outcome: 'failed',
            error: 'transaction too old',
          }),
        }),
      );
      expect(emit).toHaveBeenCalledWith('RefundFailed', {
        companyId,
        amount: 700,
        currency: 'usd',
      });
    });

    it('counts a failed planning step and keeps the request', async () => {
      provider.getRefundBasis.mockRejectedValue(new Error('provider down'));
      given({});
      await expect(service.executeFor(companyId, now)).resolves.toBeUndefined();
      expect(companyRepo.update).toHaveBeenCalledWith(companyId, {
        downgradeAttempts: 1,
      });
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('releases the request after the last failed planning step, audits it and tells the customer', async () => {
      provider.getCancellationState.mockRejectedValue(new Error('down'));
      given({
        company: company({ downgradeAttempts: MAX_PROVIDER_ATTEMPTS - 1 }),
      });
      await service.executeFor(companyId, now);
      expect(companyRepo.update).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ downgradeRequestedAt: null }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            event: 'downgrade_released',
            step: 'planning',
            error: 'down',
          }),
        }),
      );
      expect(emit).toHaveBeenCalledWith('DowngradeCancelled', {
        companyId,
        reason: DROP_REASONS.cancelFailed,
      });
      expect(provider.cancelImmediately).not.toHaveBeenCalled();
    });

    it('discards rows planned for an earlier period and plans again when a renewal came before the cancel', async () => {
      given({
        queued: [
          {
            ...queuedRow('rem-old', 900, 'h-old'),
            breakdown: { periodStart: '2026-09-01T00:00:00.000Z' },
          } as PaymentRemedy,
        ],
        payments: [payment('h-new', 3000, '2026-10-01T00:00:00Z')],
      });
      await service.executeFor(companyId, now);
      expect(remedyRepo.update).toHaveBeenCalledWith(
        { id: 'rem-old', companyId, status: 'queued' },
        {
          status: 'failed',
          lastError:
            'Superseded: a renewal came before the cancel succeeded; never sent.',
        },
      );
      expect(remedyRepo.save).toHaveBeenCalled();
      expect(provider.refundInvoicePayment).not.toHaveBeenCalledWith(
        expect.anything(),
        900,
        'rem-old',
      );
      expect(provider.refundInvoicePayment).toHaveBeenCalledWith(
        'txn_h-new',
        expect.any(Number),
        'rem-1',
      );
    });

    it('records the executed downgrade for operators, with the refund amount', async () => {
      given({ payments: [payment('h1', 3000, '2026-10-01T00:00:00Z')] });
      await service.executeFor(companyId, now);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          entityType: 'ConsoleRemedy',
          newValue: expect.objectContaining({
            event: 'downgrade_executed',
            currency: 'usd',
            subscriptionId: 'sub_1',
            operator: 'system',
          }),
        }),
      );
    });

    it('records an executed downgrade with no refund as zero', async () => {
      given({ payments: [] });
      await service.executeFor(companyId, now);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            event: 'downgrade_executed',
            amount: 0,
            currency: null,
          }),
        }),
      );
    });

    it('sends no settled notice when a webhook already moved the row', async () => {
      provider.refundInvoicePayment.mockResolvedValue({
        refundId: 'adj_1',
        state: 'approved',
      });
      remedyRepo.update.mockResolvedValue({ affected: 0 });
      given({
        company: company({ downgradeRequestedAt: null }),
        queued: [queuedRow('rem-1', 700, 'h1')],
      });
      await service.executeFor(companyId, now);
      expect(emit).not.toHaveBeenCalledWith('RefundSettled', expect.anything());
      expect(emit).toHaveBeenCalledWith('RefundRequested', expect.anything());
    });

    it('lets only queued refunds block a new request, so a failed one does not', async () => {
      given({ company: company({ downgradeRequestedAt: null }) });
      await service.request(companyId, 'sub_1', 'user-1');
      expect(manager.count).toHaveBeenCalledWith(PaymentRemedy, {
        where: { companyId, cause: 'cancel', status: 'queued' },
      });
    });
  });

  describe('applyRefundUpdate', () => {
    const event: RefundUpdatedEvent = {
      name: 'RefundUpdated',
      companyId,
      customerId: 'ctm_1',
      subscriptionId: 'sub_1',
      occurredAt: now,
      refundId: 'adj_1',
      invoiceId: 'txn_1',
      amount: 700,
      currency: 'usd',
      state: 'approved',
      reference: null,
    };

    it('ignores a pending update', async () => {
      await service.applyRefundUpdate({ ...event, state: 'pending' });
      expect(remedyRepo.findOne).not.toHaveBeenCalled();
    });

    it('ignores a refund this app did not record', async () => {
      remedyRepo.findOne.mockResolvedValue(null);
      await service.applyRefundUpdate(event);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('finds the row by the reference when the event beats the recorded refund id', async () => {
      const reference = '3f1c2a4e-0000-4000-8000-000000000001';
      remedyRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: reference,
        companyId,
        cause: 'cancel',
        amount: 700,
        currency: 'usd',
        status: 'queued',
        providerRef: null,
      });
      await service.applyRefundUpdate({ ...event, reference });
      expect(remedyRepo.findOne).toHaveBeenLastCalledWith({
        where: { id: reference, companyId },
      });
      expect(manager.update).toHaveBeenCalledWith(
        {
          id: reference,
          companyId,
          status: In(['queued', 'initiated', 'failed']),
        },
        { status: 'approved', providerRef: 'adj_1' },
      );
      expect(history.recordRefund).toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        'RefundSettled',
        expect.objectContaining({ state: 'approved' }),
      );
    });

    it('never matches a reference that is not a row id, or a row that holds another refund', async () => {
      remedyRepo.findOne.mockResolvedValue(null);
      await service.applyRefundUpdate({ ...event, reference: 'not-a-uuid' });
      expect(remedyRepo.findOne).toHaveBeenCalledTimes(1);

      remedyRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'rem-9', providerRef: 'adj_other' });
      await service.applyRefundUpdate({
        ...event,
        reference: '3f1c2a4e-0000-4000-8000-000000000001',
      });
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('lets a later approval move a refund given up as failed', async () => {
      remedyRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: '3f1c2a4e-0000-4000-8000-000000000002',
        companyId,
        cause: 'cancel',
        amount: 700,
        currency: 'usd',
        status: 'failed',
        providerRef: null,
      });
      await service.applyRefundUpdate({
        ...event,
        reference: '3f1c2a4e-0000-4000-8000-000000000002',
      });
      expect(manager.update).toHaveBeenCalledWith(
        {
          id: '3f1c2a4e-0000-4000-8000-000000000002',
          companyId,
          status: In(['queued', 'initiated', 'failed']),
        },
        { status: 'approved', providerRef: 'adj_1' },
      );
      expect(history.recordRefund).toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('audits a rejected refund for operators with amount, currency and the provider outcome', async () => {
      remedyRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        companyId,
        cause: 'cancel',
        amount: 700,
        currency: 'usd',
        status: 'initiated',
      });
      await service.applyRefundUpdate({ ...event, state: 'rejected' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          entityType: 'ConsoleRemedy',
          newValue: expect.objectContaining({
            event: 'refund_failed',
            outcome: 'rejected',
            amount: 700,
            currency: 'usd',
            reason: 'The payment provider reported the refund as rejected.',
          }),
        }),
      );
    });

    it('records a reversal after approval, keeps it on the remedy and shows rejected to the customer', async () => {
      remedyRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        companyId,
        cause: 'cancel',
        amount: 700,
        currency: 'usd',
        status: 'approved',
      });
      await service.applyRefundUpdate({ ...event, state: 'reversed' });
      expect(manager.update).toHaveBeenCalledWith(
        {
          id: 'rem-1',
          companyId,
          status: In(['queued', 'initiated', 'approved']),
        },
        { status: 'reversed', providerRef: 'adj_1' },
      );
      expect(history.setRefundStatus).toHaveBeenCalledWith(
        companyId,
        'adj_1',
        'rejected',
        manager,
      );
      expect(emit).toHaveBeenCalledWith(
        'RefundSettled',
        expect.objectContaining({ state: 'reversed' }),
      );
    });

    it('moves a cancel refund to approved, updates the history row and sends the notice', async () => {
      remedyRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        companyId,
        cause: 'cancel',
        amount: 700,
        currency: 'usd',
        status: 'initiated',
      });
      await service.applyRefundUpdate(event);
      expect(remedyRepo.findOne).toHaveBeenCalledWith({
        where: { companyId, providerRef: 'adj_1' },
      });
      expect(manager.update).toHaveBeenCalledWith(
        {
          id: 'rem-1',
          companyId,
          status: In(['queued', 'initiated', 'failed']),
        },
        { status: 'approved', providerRef: 'adj_1' },
      );
      expect(history.recordRefund).toHaveBeenCalledWith(
        {
          companyId,
          refundId: 'adj_1',
          amount: 700,
          currency: 'usd',
          refundStatus: 'approved',
          occurredAt: now,
        },
        manager,
      );
      expect(history.setRefundStatus).toHaveBeenCalledWith(
        companyId,
        'adj_1',
        'approved',
        manager,
      );
      expect(emit).toHaveBeenCalledWith('RefundSettled', {
        companyId,
        amount: 700,
        currency: 'usd',
        state: 'approved',
      });
    });

    it('moves an operator refund without a customer notice', async () => {
      remedyRepo.findOne.mockResolvedValue({
        id: 'rem-2',
        companyId,
        cause: 'make_it_right',
        amount: 500,
        currency: 'usd',
        status: 'initiated',
      });
      await service.applyRefundUpdate({ ...event, state: 'rejected' });
      expect(manager.update).toHaveBeenCalledWith(
        { id: 'rem-2', companyId, status: In(['queued', 'initiated']) },
        { status: 'rejected', providerRef: 'adj_1' },
      );
      expect(history.recordRefund).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does nothing more for a refund already settled', async () => {
      remedyRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        companyId,
        cause: 'cancel',
        status: 'approved',
      });
      manager.update.mockResolvedValue({ affected: 0 });
      await service.applyRefundUpdate(event);
      expect(history.setRefundStatus).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rolls back and sends nothing when the history write fails, so a retry redoes it', async () => {
      remedyRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        companyId,
        cause: 'cancel',
        amount: 700,
        currency: 'usd',
        status: 'initiated',
      });
      history.recordRefund.mockRejectedValue(new Error('db down'));
      await expect(service.applyRefundUpdate(event)).rejects.toThrow('db down');
      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [companyId],
      );
      expect(manager.update).toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });
});
