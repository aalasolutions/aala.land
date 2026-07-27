import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BillingEventDispatcher } from '../billing/events/billing-event-dispatcher';
import { BillingEventName } from '../billing/events/billing-events';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';

@Injectable()
export class WhatsappBillingListener implements OnModuleInit {
  private readonly logger = new Logger(WhatsappBillingListener.name);

  private static readonly EVENTS: BillingEventName[] = [
    'SubscriptionActivated',
    'SubscriptionUpdated',
    'SeatQuantityChanged',
    'PlanChanged',
    'SubscriptionCanceled',
    'PaymentSucceeded',
  ];

  constructor(
    private readonly dispatcher: BillingEventDispatcher,
    private readonly repo: WhatsappAiRepositoryService,
  ) {}

  onModuleInit(): void {
    for (const name of WhatsappBillingListener.EVENTS) {
      this.dispatcher.register(name, (event) => {
        try {
          this.repo.clearContextCache(event.companyId);
        } catch (err) {
          this.logger.error(
            `Failed to clear AI caches for company ${event.companyId}`,
            err instanceof Error ? err.message : err,
          );
        }
        return Promise.resolve();
      });
    }
  }
}
