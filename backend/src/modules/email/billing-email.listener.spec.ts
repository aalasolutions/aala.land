import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BillingWebhookService } from '../billing/billing-webhook.service';
import { BillingHistoryService } from '../billing/billing-history.service';
import { BillingService } from '../billing/billing.service';
import { BillingEvent } from '../billing/entities/billing-event.entity';
import { BILLING_PROVIDER } from '../billing/provider/billing-provider.interface';
import { Company } from '../companies/entities/company.entity';
import { BillingEventDispatcher } from '../billing/events/billing-event-dispatcher';
import { BillingNotices } from '../billing/events/billing-notices';
import { BillingDowngradeService } from '../billing/billing-downgrade.service';
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
  let notices: BillingNotices;
  let email: jest.Mocked<
    Pick<
      SystemEmailService,
      | 'sendPurchaseConfirmationToCompany'
      | 'sendPaymentSucceededToCompany'
      | 'sendSettledWithoutChargeToCompany'
      | 'sendPaymentFailedToCompany'
      | 'sendDowngradeRequestedToCompany'
      | 'sendRefundRequestedToCompany'
      | 'sendRefundSettledToCompany'
      | 'sendDowngradeCancelledToCompany'
      | 'sendRefundFailedToCompany'
    >
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingEmailListener,
        BillingEventDispatcher,
        BillingNotices,
        {
          provide: SystemEmailService,
          useValue: {
            sendPurchaseConfirmationToCompany: jest.fn(),
            sendPaymentSucceededToCompany: jest.fn(),
            sendSettledWithoutChargeToCompany: jest.fn(),
            sendPaymentFailedToCompany: jest.fn(),
            sendDowngradeRequestedToCompany: jest.fn(),
            sendRefundRequestedToCompany: jest.fn(),
            sendRefundSettledToCompany: jest.fn(),
            sendDowngradeCancelledToCompany: jest.fn(),
            sendRefundFailedToCompany: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get(BillingEmailListener);
    dispatcher = module.get(BillingEventDispatcher);
    notices = module.get(BillingNotices);
    email = module.get(SystemEmailService);
    listener.onApplicationBootstrap();
  });

  it('confirms a downgrade request with its effective time', async () => {
    const effectiveAt = new Date('2026-10-06T10:00:00Z');
    await notices.emit('DowngradeRequested', {
      companyId: 'co-1',
      effectiveAt,
    });
    expect(email.sendDowngradeRequestedToCompany).toHaveBeenCalledWith(
      'co-1',
      effectiveAt,
    );
  });

  it('announces a requested refund with its amount', async () => {
    await notices.emit('RefundRequested', {
      companyId: 'co-1',
      amount: 1650,
      currency: 'usd',
    });
    expect(email.sendRefundRequestedToCompany).toHaveBeenCalledWith(
      'co-1',
      1650,
      'usd',
    );
  });

  it('tells the customer a refund was left to the team', async () => {
    await notices.emit('RefundFailed', {
      companyId: 'co-1',
      amount: 700,
      currency: 'usd',
    });
    expect(email.sendRefundFailedToCompany).toHaveBeenCalledWith(
      'co-1',
      700,
      'usd',
    );
  });

  it('tells the customer a dropped request and why', async () => {
    await notices.emit('DowngradeCancelled', {
      companyId: 'co-1',
      reason: 'Your team grew.',
    });
    expect(email.sendDowngradeCancelledToCompany).toHaveBeenCalledWith(
      'co-1',
      'Your team grew.',
    );
  });

  it('reports approved, rejected and reversed refunds', async () => {
    await notices.emit('RefundSettled', {
      companyId: 'co-1',
      amount: 1650,
      currency: 'usd',
      state: 'approved',
    });
    await notices.emit('RefundSettled', {
      companyId: 'co-1',
      amount: 1650,
      currency: 'usd',
      state: 'rejected',
    });
    await notices.emit('RefundSettled', {
      companyId: 'co-1',
      amount: 1650,
      currency: 'usd',
      state: 'reversed',
    });
    expect(email.sendRefundSettledToCompany).toHaveBeenNthCalledWith(
      1,
      'co-1',
      1650,
      'usd',
      'approved',
    );
    expect(email.sendRefundSettledToCompany).toHaveBeenNthCalledWith(
      2,
      'co-1',
      1650,
      'usd',
      'rejected',
    );
    expect(email.sendRefundSettledToCompany).toHaveBeenNthCalledWith(
      3,
      'co-1',
      1650,
      'usd',
      'reversed',
    );
  });

  it('swallows a failing notice email', async () => {
    email.sendRefundRequestedToCompany.mockRejectedValue(new Error('smtp'));
    await expect(
      notices.emit('RefundRequested', {
        companyId: 'co-1',
        amount: 1,
        currency: 'usd',
      }),
    ).resolves.toBeUndefined();
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
          BillingNotices,
          { provide: BillingDowngradeService, useValue: {} },
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
