import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BillingWebhookService } from '../billing/billing-webhook.service';
import { BillingHistoryService } from '../billing/billing-history.service';
import { BillingService } from '../billing/billing.service';
import { BillingEvent } from '../billing/entities/billing-event.entity';
import { BILLING_PROVIDER } from '../billing/provider/billing-provider.interface';
import { Company } from '../companies/entities/company.entity';
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
      | 'sendSettledWithoutChargeToCompany'
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
            sendSettledWithoutChargeToCompany: jest.fn(),
            sendPaymentFailedToCompany: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get(BillingEmailListener);
    dispatcher = module.get(BillingEventDispatcher);
    email = module.get(SystemEmailService);
    listener.onApplicationBootstrap();
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

  it('sends a credit notice, not a receipt, for an invoice paid from credit', async () => {
    await dispatcher.dispatch({
      name: 'PaymentSucceeded',
      companyId: 'co-1',
      amount: 0,
      currency: 'usd',
      hostedInvoiceUrl: null,
      creditApplied: 2498,
      creditIssued: 0,
      settledWithoutCharge: true,
    } as PaymentSucceededEvent);
    expect(email.sendSettledWithoutChargeToCompany).toHaveBeenCalledWith(
      'co-1',
      2498,
      0,
      'usd',
    );
    expect(email.sendPaymentSucceededToCompany).not.toHaveBeenCalled();
  });

  it('sends a credit notice, not a receipt, when a change issues credit', async () => {
    await dispatcher.dispatch({
      name: 'PaymentSucceeded',
      companyId: 'co-1',
      amount: 0,
      currency: 'usd',
      hostedInvoiceUrl: null,
      creditApplied: 0,
      creditIssued: 2500,
      settledWithoutCharge: true,
    } as PaymentSucceededEvent);
    expect(email.sendSettledWithoutChargeToCompany).toHaveBeenCalledWith(
      'co-1',
      0,
      2500,
      'usd',
    );
    expect(email.sendPaymentSucceededToCompany).not.toHaveBeenCalled();
  });

  it('sends nothing for a zero-charge settlement that moved no credit', async () => {
    await dispatcher.dispatch({
      name: 'PaymentSucceeded',
      companyId: 'co-1',
      amount: 0,
      currency: 'usd',
      hostedInvoiceUrl: null,
      settledWithoutCharge: true,
    } as PaymentSucceededEvent);
    expect(email.sendSettledWithoutChargeToCompany).not.toHaveBeenCalled();
    expect(email.sendPaymentSucceededToCompany).not.toHaveBeenCalled();
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

  describe('with the real BillingWebhookService wiring', () => {
    const activated = {
      name: 'SubscriptionActivated',
      companyId: 'co-1',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      occurredAt: new Date('2026-07-02T00:00:00Z'),
      plan: 'PRO',
      quantity: 5,
      status: 'active',
      currency: 'usd',
      currentPeriodEnd: null,
    } as SubscriptionActivatedEvent;

    let app: TestingModule;
    let reconcile: jest.Mock;
    let sendPurchase: jest.Mock;
    let order: string[];

    beforeEach(async () => {
      order = [];
      reconcile = jest.fn(() => {
        order.push('reconcile');
        return Promise.resolve(2);
      });
      sendPurchase = jest.fn(() => {
        order.push('email');
        return Promise.resolve();
      });
      const queryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      app = await Test.createTestingModule({
        // Listener first: provider order must not decide handler order.
        providers: [
          BillingEmailListener,
          BillingWebhookService,
          BillingEventDispatcher,
          {
            provide: SystemEmailService,
            useValue: { sendPurchaseConfirmationToCompany: sendPurchase },
          },
          { provide: getRepositoryToken(BillingEvent), useValue: {} },
          {
            provide: getRepositoryToken(Company),
            useValue: { createQueryBuilder: jest.fn(() => queryBuilder) },
          },
          {
            provide: BILLING_PROVIDER,
            useValue: { checkoutQuantityEditable: true },
          },
          { provide: BillingHistoryService, useValue: {} },
          {
            provide: BillingService,
            useValue: { reconcileSeatsToActiveUsers: reconcile },
          },
        ],
      }).compile();
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('reconciles before the purchase email and the email reports the reconciled seats', async () => {
      await app.get(BillingEventDispatcher).dispatch({ ...activated });

      expect(reconcile).toHaveBeenCalledWith('co-1', 'sub_1');
      expect(order).toEqual(['reconcile', 'email']);
      expect(sendPurchase).toHaveBeenCalledWith('co-1', 'Pro', 2);
    });

    it('rejects the dispatch and sends no purchase email when the reconcile fails', async () => {
      reconcile.mockRejectedValue(new Error('provider down'));

      await expect(
        app.get(BillingEventDispatcher).dispatch({ ...activated }),
      ).rejects.toThrow('provider down');
      expect(sendPurchase).not.toHaveBeenCalled();
    });
  });
});
