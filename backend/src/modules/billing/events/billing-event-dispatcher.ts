import { Injectable, Logger } from '@nestjs/common';
import { BillingEventName, NormalizedBillingEvent } from './billing-events';

type AnyBillingHandler = (event: NormalizedBillingEvent) => Promise<void>;

type BillingHandlerFor<N extends BillingEventName> = (
    event: Extract<NormalizedBillingEvent, { name: N }>,
) => Promise<void>;

/**
 * In-process billing event registry. Unit 2 registers the company-sync handlers;
 * units 3 to 5 register their own reactions on the same instance (exported from
 * BillingModule). Deliberately not @nestjs/event-emitter: dispatch must be awaited
 * and failures must propagate to the webhook response, which fire-and-forget
 * emitters do not give us.
 */
@Injectable()
export class BillingEventDispatcher {
    private readonly logger = new Logger(BillingEventDispatcher.name);
    private readonly handlers = new Map<BillingEventName, AnyBillingHandler[]>();

    register<N extends BillingEventName>(name: N, handler: BillingHandlerFor<N>): void {
        const list = this.handlers.get(name) ?? [];
        list.push(handler as AnyBillingHandler);
        this.handlers.set(name, list);
    }

    /**
     * Runs every registered handler for the event, sequentially, in registration
     * order. Rethrows the first failure; the caller decides what a failure means
     * (the webhook service returns 500 and leaves processed_at NULL).
     */
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
