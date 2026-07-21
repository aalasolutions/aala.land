import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BillingEventDispatcher } from '../billing/events/billing-event-dispatcher';
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

/**
 * Sends billing emails off the normalized billing events. Registers as an
 * ADDITIONAL consumer on the shared dispatcher, alongside the company-sync
 * handlers, without touching them. Every handler is best-effort: an email
 * failure is logged and swallowed so it can never fail the webhook (which would
 * make Stripe retry and leave processed_at NULL). Recipient resolution lives in
 * SystemEmailService (the company-level send methods).
 */
@Injectable()
export class BillingEmailListener implements OnModuleInit {
  private readonly logger = new Logger(BillingEmailListener.name);

  constructor(
    private readonly dispatcher: BillingEventDispatcher,
    private readonly email: SystemEmailService,
  ) {}

  onModuleInit(): void {
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
      this.safe(() =>
        this.email.sendPaymentSucceededToCompany(
          e.companyId,
          (e as PaymentSucceededEvent).amount,
          (e as PaymentSucceededEvent).currency,
          (e as PaymentSucceededEvent).hostedInvoiceUrl,
        ),
      ),
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
  }

  /** Never let an email failure propagate into the webhook response. */
  private async safe(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(
        `Billing email failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
