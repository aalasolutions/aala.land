import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
    BillingProvider, BillingPriceKind, EnsureCustomerInput,
} from './billing-provider.interface';

@Injectable()
export class StripeBillingProvider implements BillingProvider {
    private readonly logger = new Logger(StripeBillingProvider.name);
    private readonly stripe: Stripe;
    private productIdCache: string | null = null;

    constructor(private readonly config: ConfigService) {
        this.stripe = new Stripe(this.config.getOrThrow<string>('STRIPE_SECRET_KEY'));
    }

    async ensureCustomer(input: EnsureCustomerInput): Promise<string> {
        const customer = await this.stripe.customers.create({
            name: input.companyName,
            email: input.email ?? undefined,
            metadata: { companyId: input.companyId },
        });
        return customer.id;
    }

    async ensurePrice(kind: BillingPriceKind, currency: string, unitAmount: number): Promise<string> {
        const product = await this.ensureProduct();
        const price = await this.stripe.prices.create({
            product,
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            recurring: { interval: 'month' },
            metadata: { kind, currency },
        });
        return price.id;
    }

    /**
     * Find-or-create one shared Product. Best-effort dedupe: the Stripe Search API has indexing lag
     * (up to about a minute), so a rare duplicate Product is possible and harmless, because prices
     * are always resolved via billing_prices.provider_price_id, never by Product. No manual Stripe step.
     */
    private async ensureProduct(): Promise<string> {
        if (this.productIdCache) return this.productIdCache;
        const found = await this.stripe.products.search({
            query: "active:'true' AND metadata['aala_product']:'subscription'",
        });
        if (found.data[0]) {
            this.productIdCache = found.data[0].id;
            return this.productIdCache;
        }
        const product = await this.stripe.products.create({
            name: 'AALA Subscription',
            metadata: { aala_product: 'subscription' },
        });
        this.logger.log(`Created Stripe product ${product.id}`);
        this.productIdCache = product.id;
        return product.id;
    }
}
