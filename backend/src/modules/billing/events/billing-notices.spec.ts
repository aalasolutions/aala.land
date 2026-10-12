import { BillingNotices } from './billing-notices';

describe('BillingNotices', () => {
  it('calls every handler of a notice in registration order', async () => {
    const notices = new BillingNotices();
    const order: string[] = [];
    notices.on('RefundRequested', () => {
      order.push('first');
      return Promise.resolve();
    });
    notices.on('RefundRequested', () => {
      order.push('second');
      return Promise.resolve();
    });
    await notices.emit('RefundRequested', {
      companyId: 'co-1',
      amount: 100,
      currency: 'usd',
    });
    expect(order).toEqual(['first', 'second']);
  });

  it('keeps going and never throws when a handler fails', async () => {
    const notices = new BillingNotices();
    const after = jest.fn().mockResolvedValue(undefined);
    notices.on('DowngradeRequested', () => Promise.reject(new Error('smtp')));
    notices.on('DowngradeRequested', after);
    await expect(
      notices.emit('DowngradeRequested', {
        companyId: 'co-1',
        effectiveAt: new Date(),
      }),
    ).resolves.toBeUndefined();
    expect(after).toHaveBeenCalled();
  });

  it('does nothing for a notice nobody listens to', async () => {
    await expect(
      new BillingNotices().emit('RefundSettled', {
        companyId: 'co-1',
        amount: 1,
        currency: 'usd',
        state: 'approved',
      }),
    ).resolves.toBeUndefined();
  });
});
