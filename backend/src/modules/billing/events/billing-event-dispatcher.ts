import { Injectable, Logger } from '@nestjs/common';
import { BillingEventName, NormalizedBillingEvent } from './billing-events';

type AnyBillingHandler = (event: NormalizedBillingEvent) => Promise<void>;

type BillingHandlerFor<N extends BillingEventName> = (
  event: Extract<NormalizedBillingEvent, { name: N }>,
) => Promise<void>;

/** Not @nestjs/event-emitter: awaited so failures propagate to the webhook response. */
@Injectable()
export class BillingEventDispatcher {
  private readonly logger = new Logger(BillingEventDispatcher.name);
  private readonly handlers = new Map<BillingEventName, AnyBillingHandler[]>();

  register<N extends BillingEventName>(
    name: N,
    handler: BillingHandlerFor<N>,
  ): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as AnyBillingHandler);
    this.handlers.set(name, list);
  }

  /** Rethrows the first failure; webhook service returns 500 and leaves processed_at NULL. */
  async dispatch(event: NormalizedBillingEvent): Promise<void> {
    const list = this.handlers.get(event.name) ?? [];
    if (list.length === 0) {
      this.logger.debug(`No handlers registered for ${event.name}`);
      return;
    }
    for (const handler of list) {
      await handler(event);
    }
  }
}
