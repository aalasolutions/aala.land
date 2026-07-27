import { WhatsappBillingListener } from './whatsapp-billing.listener';
import { BillingEventDispatcher } from '../billing/events/billing-event-dispatcher';
import { NormalizedBillingEvent } from '../billing/events/billing-events';

const event = (name: string, companyId = 'co-1') =>
  ({
    name,
    companyId,
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
    occurredAt: new Date(),
  }) as unknown as NormalizedBillingEvent;

describe('WhatsappBillingListener', () => {
  let dispatcher: BillingEventDispatcher;
  let repo: { clearContextCache: jest.Mock };

  beforeEach(() => {
    dispatcher = new BillingEventDispatcher();
    repo = { clearContextCache: jest.fn() };
    new WhatsappBillingListener(dispatcher, repo as any).onModuleInit();
  });

  it.each([
    'SubscriptionActivated',
    'SubscriptionUpdated',
    'SeatQuantityChanged',
    'PlanChanged',
    'SubscriptionCanceled',
    'PaymentSucceeded',
  ])('drops the cached company on %s', async (name) => {
    await dispatcher.dispatch(event(name));
    expect(repo.clearContextCache).toHaveBeenCalledWith('co-1');
  });

  it('ignores PaymentFailed, which changes neither seats nor the cycle', async () => {
    await dispatcher.dispatch(event('PaymentFailed'));
    expect(repo.clearContextCache).not.toHaveBeenCalled();
  });

  it('never lets a cache failure reach the webhook', async () => {
    repo.clearContextCache.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(
      dispatcher.dispatch(event('SeatQuantityChanged')),
    ).resolves.toBeUndefined();
  });

  it('clears only the company the event names', async () => {
    await dispatcher.dispatch(event('PlanChanged', 'co-9'));
    expect(repo.clearContextCache).toHaveBeenCalledWith('co-9');
    expect(repo.clearContextCache).toHaveBeenCalledTimes(1);
  });
});
