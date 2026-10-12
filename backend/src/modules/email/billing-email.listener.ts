import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { errorMessage } from '@shared/utils/error.util';
import { BillingEventDispatcher } from '../billing/events/billing-event-dispatcher';
import { BillingNotices } from '../billing/events/billing-notices';
import {
  PaymentFailedEvent,
  PaymentSucceededEvent,
  SubscriptionActivatedEvent,
} from '../billing/events/billing-events';
import { BillingPlan } from '../billing/provider/billing-provider.interface';
import { SystemEmailService } from './system-email.service';

function planLabel(plan: BillingPlan): string {
  return plan === 'ENTERPRISE' ? 'Enterprise' : 'Pro';
}

// Best-effort: failure is logged and swallowed so it can't fail the webhook or trigger a retry.
@Injectable()
export class BillingEmailListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingEmailListener.name);

  constructor(
    private readonly dispatcher: BillingEventDispatcher,
    private readonly email: SystemEmailService,
    private readonly notices: BillingNotices,
  ) {}

  // Runs after all onModuleInit hooks so the email follows the seat reconcile.
  onApplicationBootstrap(): void {
    this.dispatcher.register('SubscriptionActivated', (e) =>
      this.safe(() =>
        this.email.sendPurchaseConfirmationToCompany(
          e.companyId,
          planLabel((e as SubscriptionActivatedEvent).plan),
          Math.max((e as SubscriptionActivatedEvent).quantity, 1),
        ),
      ),
    );
    this.dispatcher.register('PaymentSucceeded', (e) =>
      this.safe(() => this.onPaymentSucceeded(e)),
    );
    this.dispatcher.register('PaymentFailed', (e) =>
      this.safe(() =>
        this.email.sendPaymentFailedToCompany(
          e.companyId,
          (e as PaymentFailedEvent).amount,
          (e as PaymentFailedEvent).currency,
          (e as PaymentFailedEvent).attemptCount,
        ),
      ),
    );
    this.notices.on('DowngradeRequested', (n) =>
      this.safe(() =>
        this.email.sendDowngradeRequestedToCompany(n.companyId, n.effectiveAt),
      ),
    );
    this.notices.on('RefundRequested', (n) =>
      this.safe(() =>
        this.email.sendRefundRequestedToCompany(
          n.companyId,
          n.amount,
          n.currency,
        ),
      ),
    );
    this.notices.on('RefundSettled', (n) =>
      this.safe(() =>
        this.email.sendRefundSettledToCompany(
          n.companyId,
          n.amount,
          n.currency,
          n.state,
        ),
      ),
    );
    this.notices.on('RefundFailed', (n) =>
      this.safe(() =>
        this.email.sendRefundFailedToCompany(n.companyId, n.amount, n.currency),
      ),
    );
    this.notices.on('DowngradeCancelled', (n) =>
      this.safe(() =>
        this.email.sendDowngradeCancelledToCompany(n.companyId, n.reason),
      ),
    );
  }

  private onPaymentSucceeded(e: PaymentSucceededEvent): Promise<void> {
    if (!e.settledWithoutCharge) {
      return this.email.sendPaymentSucceededToCompany(
        e.companyId,
        e.amount,
        e.currency,
        e.hostedInvoiceUrl,
      );
    }
    const creditApplied = e.creditApplied ?? 0;
    const creditIssued = e.creditIssued ?? 0;
    if (creditApplied <= 0 && creditIssued <= 0) return Promise.resolve();
    return this.email.sendSettledWithoutChargeToCompany(
      e.companyId,
      creditApplied,
      creditIssued,
      e.currency,
    );
  }

  /** Never let an email failure propagate into the webhook response. */
  private async safe(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Billing email failed: ${errorMessage(err)}`);
    }
  }
}
