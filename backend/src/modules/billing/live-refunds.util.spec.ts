import { EntityManager, In } from 'typeorm';
import { PaymentRemedy } from '../console/entities/payment-remedy.entity';
import { liveRefundTotals } from './live-refunds.util';

function managerWith(refunds: Partial<PaymentRemedy>[]) {
  const find = jest.fn().mockResolvedValue(refunds);
  return { manager: { find } as unknown as EntityManager, find };
}

describe('liveRefundTotals', () => {
  it('matches live refunds of the company by history row or by provider id', async () => {
    const { manager, find } = managerWith([]);
    await liveRefundTotals(manager, 'co-1', [
      { billingHistoryId: 'h1', providerInvoiceId: 'txn_1' },
    ]);
    const live = In(['queued', 'initiated', 'approved']);
    expect(find).toHaveBeenCalledWith(PaymentRemedy, {
      where: [
        {
          companyId: 'co-1',
          kind: 'refund',
          status: live,
          billingHistoryId: In(['h1']),
        },
        {
          companyId: 'co-1',
          kind: 'refund',
          status: live,
          providerInvoiceId: In(['txn_1']),
        },
      ],
    });
  });

  it('counts a refund made before the history row existed against the row that arrives later', async () => {
    const { manager } = managerWith([
      { billingHistoryId: null, providerInvoiceId: 'txn_1', amount: 2500 },
      { billingHistoryId: 'h1', providerInvoiceId: null, amount: 300 },
    ]);
    const totals = await liveRefundTotals(manager, 'co-1', [
      { billingHistoryId: 'h1', providerInvoiceId: 'txn_1' },
    ]);
    expect(totals.get('txn_1')).toBe(2800);
  });

  it('queries only by provider id for a payment with no history row yet', async () => {
    const { manager, find } = managerWith([]);
    await liveRefundTotals(manager, 'co-1', [
      { billingHistoryId: null, providerInvoiceId: 'txn_2' },
    ]);
    expect(find.mock.calls[0][1].where).toHaveLength(1);
  });

  it('reads nothing for no payments', async () => {
    const { manager, find } = managerWith([]);
    await expect(liveRefundTotals(manager, 'co-1', [])).resolves.toEqual(
      new Map(),
    );
    expect(find).not.toHaveBeenCalled();
  });
});
