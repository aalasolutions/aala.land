import { Injectable, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Company, SubscriptionTier, TIER_LIMITS } from '../companies/entities/company.entity';

@Injectable()
export class BillingService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
        private readonly configService: ConfigService,
        @Inject('STRIPE') private readonly stripe: any,
    ) {}

    async createCheckoutSession(companyId: string, tier: 'STARTER' | 'PRO'): Promise<{ url: string | null }> {
        const company = await this.companyRepository.findOne({ where: { id: companyId } });
        if (!company) throw new ForbiddenException('Company not found');

        if (company.subscriptionTier === tier) {
            throw new BadRequestException(`Already on ${tier} plan`);
        }

        const priceId = tier === 'STARTER'
            ? this.configService.get<string>('STRIPE_STARTER_PRICE_ID')!
            : this.configService.get<string>('STRIPE_PRO_PRICE_ID')!;

        // Company already has an active subscription — update the price in place
        if (company.stripeSubscriptionId) {
            const subscription = await this.stripe.subscriptions.retrieve(company.stripeSubscriptionId);
            await this.stripe.subscriptions.update(company.stripeSubscriptionId, {
                items: [{ id: subscription.items.data[0].id, price: priceId }],
                proration_behavior: 'create_prorations',
            });
            const limits = TIER_LIMITS[tier as SubscriptionTier];
            await this.companyRepository.update(companyId, {
                subscriptionTier: tier as SubscriptionTier,
                maxUsers: limits.maxUsers,
                maxCountries: limits.maxCountries,
                maxProperties: limits.maxProperties,
            });
            return { url: null };
        }

        let customerId = company.stripeCustomerId;
        if (!customerId) {
            const customer = await this.stripe.customers.create({
                metadata: { companyId: company.id, companyName: company.name },
            });
            customerId = customer.id;
            await this.companyRepository.update(company.id, { stripeCustomerId: customerId });
        }

        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${frontendUrl}/billing/success`,
            cancel_url: `${frontendUrl}/billing/cancel`,
            metadata: { companyId: company.id, tier },
        });

        return { url: session.url! };
    }

    async cancelSubscription(companyId: string): Promise<void> {
        const company = await this.companyRepository.findOne({ where: { id: companyId } });
        if (!company) throw new ForbiddenException('Company not found');

        if (!company.stripeSubscriptionId) {
            throw new BadRequestException('No active subscription to cancel');
        }

        await this.stripe.subscriptions.cancel(company.stripeSubscriptionId);
    }

    async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
        let event: any;
        try {
            event = this.stripe.webhooks.constructEvent(
                rawBody,
                signature,
                this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!,
            );
        } catch (err) {
            throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
        }

        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
        }
    }

    private async handleCheckoutCompleted(session: any): Promise<void> {
        const { companyId, tier } = session.metadata;
        const limits = TIER_LIMITS[tier as SubscriptionTier];
        const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
        await this.companyRepository.update(companyId, {
            subscriptionTier: tier as SubscriptionTier,
            stripeSubscriptionId: session.subscription as string,
            stripeSubscriptionStatus: 'active',
            subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
            maxUsers: limits.maxUsers,
            maxCountries: limits.maxCountries,
            maxProperties: limits.maxProperties,
        });
    }

    private async handleSubscriptionUpdated(subscription: any): Promise<void> {
        const company = await this.companyRepository.findOne({ where: { stripeSubscriptionId: subscription.id } });
        if (!company) return;
        await this.companyRepository.update(company.id, {
            stripeSubscriptionStatus: subscription.status,
            subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
        });
    }

    private async handleSubscriptionDeleted(subscription: any): Promise<void> {
        const company = await this.companyRepository.findOne({ where: { stripeCustomerId: subscription.customer as string } });
        if (!company) return;
        const freeLimits = TIER_LIMITS[SubscriptionTier.FREE];
        await this.companyRepository.update(company.id, {
            subscriptionTier: SubscriptionTier.FREE,
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: 'canceled',
            subscriptionExpiresAt: null,
            maxUsers: freeLimits.maxUsers,
            maxCountries: freeLimits.maxCountries,
            maxProperties: freeLimits.maxProperties,
        });
    }

    private async handlePaymentFailed(invoice: any): Promise<void> {
        const company = await this.companyRepository.findOne({ where: { stripeCustomerId: invoice.customer as string } });
        if (!company) return;
        await this.companyRepository.update(company.id, { stripeSubscriptionStatus: 'past_due' });
    }
}
