import { Test, TestingModule } from '@nestjs/testing';
import { BillingEventDispatcher } from '../billing/events/billing-event-dispatcher';
import { SystemEmailService } from './system-email.service';
import { BillingEmailListener } from './billing-email.listener';
import {
  PaymentFailedEvent,
  PaymentSucceededEvent,
  SubscriptionActivatedEvent,
} from '../billing/events/billing-events';

describe('BillingEmailListener', () => {
  let listener: BillingEmailListener;
  let dispatcher: BillingEventDispatcher;
  let email: jest.Mocked<
    Pick<
      SystemEmailService,
      | 'sendPurchaseConfirmationToCompany'
      | 'sendPaymentSucceededToCompany'
      | 'sendPaymentFailedToCompany'
    >
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingEmailListener,
        BillingEventDispatcher,
        {
          provide: SystemEmailService,
          useValue: {
            sendPurchaseConfirmationToCompany: jest.fn(),
            sendPaymentSucceededToCompany: jest.fn(),
            sendPaymentFailedToCompany: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get(BillingEmailListener);
    dispatcher = module.get(BillingEventDispatcher);
    email = module.get(SystemEmailService);
    listener.onModuleInit();
  });

  it('sends a purchase confirmation on SubscriptionActivated', async () => {
    await dispatcher.dispatch({
      name: 'SubscriptionActivated',
      companyId: 'co-1',
      plan: 'PRO',
      quantity: 3,
    } as SubscriptionActivatedEvent);
    expect(email.sendPurchaseConfirmationToCompany).toHaveBeenCalledWith(
      'co-1',
      'Pro',
      3,
    );
  });

  it('maps ENTERPRISE plan to the Enterprise label', async () => {
    await dispatcher.dispatch({
      name: 'SubscriptionActivated',
      companyId: 'co-1',
      plan: 'ENTERPRISE',
      quantity: 1,
    } as SubscriptionActivatedEvent);
    expect(email.sendPurchaseConfirmationToCompany).toHaveBeenCalledWith(
      'co-1',
      'Enterprise',
      1,
    );
  });

  it('sends a receipt on PaymentSucceeded', async () => {
    await dispatcher.dispatch({
      name: 'PaymentSucceeded',
      companyId: 'co-1',
      amount: 2500,
      currency: 'usd',
      hostedInvoiceUrl: 'https://invoice',
    } as PaymentSucceededEvent);
    expect(email.sendPaymentSucceededToCompany).toHaveBeenCalledWith(
      'co-1',
      2500,
      'usd',
      'https://invoice',
    );
  });

  it('sends an alert on PaymentFailed', async () => {
    await dispatcher.dispatch({
      name: 'PaymentFailed',
      companyId: 'co-1',
      amount: 2500,
      currency: 'usd',
      attemptCount: 2,
    } as PaymentFailedEvent);
    expect(email.sendPaymentFailedToCompany).toHaveBeenCalledWith(
      'co-1',
      2500,
      'usd',
      2,
    );
  });

  it('swallows email failures so the webhook never 500s', async () => {
    (
      email.sendPaymentFailedToCompany as jest.Mock
    ).mockRejectedValue(new Error('smtp down'));
    await expect(
      dispatcher.dispatch({
        name: 'PaymentFailed',
        companyId: 'co-1',
        amount: 2500,
        currency: 'usd',
        attemptCount: 1,
      } as PaymentFailedEvent),
    ).resolves.toBeUndefined();
  });
});
