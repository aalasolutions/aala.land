import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, SubscriptionTier } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { BillingPrice } from './entities/billing-price.entity';
import {
    BillingPlan,
    BillingProvider,
    BILLING_PROVIDER,
} from './provider/billing-provider.interface';
import { resolveBillingCurrency } from './billing-currency.util';

/** Shape returned by getSubscriptionState. */
export interface SubscriptionState {
    tier: SubscriptionTier;
    billingStatus: string | null;
    hasSubscription: boolean;
    purchasedSeats: number;
    activeUsers: number;
    currency: string;
    seatAmount: number | null;
    canDowngradeToFree: boolean;
}

/** Shape returned by startCheckout / adminCheckout. */
export interface CheckoutResult {
    checkoutUrl: string;
    /** Always null: subscriptionId arrives via webhook (single writer). */
    subscriptionId: null;
}

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(
        @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
        @InjectRepository(BillingPrice) private readonly priceRepo: Repository<BillingPrice>,
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
        private readonly config: ConfigService,
    ) {}

    // -------------------------------------------------------------------------
    // Unit 1 methods (unchanged)
    // -------------------------------------------------------------------------

    /** Idempotent: returns the existing customer id or creates one. Safe to call again at subscribe time. */
    async ensureCompanyCustomer(company: Company): Promise<string> {
        if (company.billingCustomerId) return company.billingCustomerId;
        const customerId = await this.provider.ensureCustomer({
            companyId: company.id,
            companyName: company.name,
        });
        await this.companyRepo.update(company.id, {
            billingCustomerId: customerId,
            billingProvider: 'stripe',
        });
        return customerId;
    }

    /** Creates the provider Price for any active row that has no provider_price_id yet. */
    async syncPrices(): Promise<{ synced: number; total: number }> {
        const rows = await this.priceRepo.find({ where: { active: true } });
        let synced = 0;
        for (const row of rows) {
            if (row.providerPriceId) continue;
            const priceId = await this.provider.ensurePrice(row.kind, row.currency, row.unitAmount);
            await this.priceRepo.update(row.id, { providerPriceId: priceId });
            synced++;
        }
        return { synced, total: rows.length };
    }

    // -------------------------------------------------------------------------
    // Unit 3 methods (subscription lifecycle)
    // -------------------------------------------------------------------------

    /** Return the current billing-relevant snapshot for a company. */
    async getSubscriptionState(companyId: string): Promise<SubscriptionState> {
        const company = await this.findCompany(companyId);
        const currency = resolveBillingCurrency(company.defaultRegionCode);
        const [seatPrice, activeUsers] = await Promise.all([
            this.priceRepo.findOne({ where: { kind: 'SEAT', currency, active: true } }),
            this.countActiveUsers(companyId),
        ]);
        return {
            tier: company.subscriptionTier,
            billingStatus: company.billingStatus ?? null,
            hasSubscription: !!company.billingSubscriptionId,
            purchasedSeats: company.purchasedSeats,
            activeUsers,
            currency,
            seatAmount: seatPrice?.unitAmount ?? null,
            canDowngradeToFree: activeUsers <= 1,
        };
    }

    /**
     * Open a hosted Checkout session for PRO (self-serve, COMPANY_ADMIN).
     *
     * CONTRACT INVARIANTS:
     * - ENTERPRISE is gated to SUPER_ADMIN only (enforced in the controller).
     * - ensureCompanyCustomer is called here to satisfy the CUSTOMER PRECONDITION.
     * - The subscription id is null; it arrives via the SubscriptionActivated webhook.
     * - quantity is set to the current active user count (minimum 1).
     */
    async startCheckout(
        companyId: string,
        successUrl: string,
        cancelUrl: string,
    ): Promise<CheckoutResult> {
        const company = await this.findCompany(companyId);
        if (company.billingSubscriptionId) {
            throw new ConflictException('This company already has an active subscription.');
        }
        // Self-serve checkout is the FREE -> PRO upgrade path only. A comped
        // PRO/ENTERPRISE company (tier set manually with no subscription) must not
        // be able to open a fresh checkout that the webhook would then re-tier.
        if (company.subscriptionTier !== SubscriptionTier.FREE) {
            throw new ConflictException('Checkout is only available for companies on the FREE plan.');
        }
        this.assertAllowedRedirectUrl(successUrl, 'successUrl');
        this.assertAllowedRedirectUrl(cancelUrl, 'cancelUrl');
        const customerId = await this.ensureCompanyCustomer(company);
        const currency = resolveBillingCurrency(company.defaultRegionCode);
        const quantity = Math.max(await this.countActiveUsers(companyId), 1);

        const seatPriceId = await this.getProviderPriceId('SEAT', currency);

        const result = await this.provider.createSubscription({
            customerId,
            seatPriceId,
            basePriceId: null,
            quantity,
            successUrl,
            cancelUrl,
            companyId,
        });
        return result;
    }

    /**
     * Open a hosted Checkout session for any plan (SUPER_ADMIN only).
     * ENTERPRISE requires basePriceId; PRO does not.
     */
    async adminStartCheckout(
        companyId: string,
        plan: BillingPlan,
        quantity: number,
        successUrl: string,
        cancelUrl: string,
    ): Promise<CheckoutResult> {
        const company = await this.findCompany(companyId);
        if (company.billingSubscriptionId) {
            throw new ConflictException(
                'Company already has a subscription. Use admin/change-plan to switch plans.',
            );
        }
        this.assertAllowedRedirectUrl(successUrl, 'successUrl');
        this.assertAllowedRedirectUrl(cancelUrl, 'cancelUrl');
        const customerId = await this.ensureCompanyCustomer(company);
        const currency = resolveBillingCurrency(company.defaultRegionCode);

        const seatPriceId = await this.getProviderPriceId('SEAT', currency);
        const basePriceId =
            plan === 'ENTERPRISE' ? await this.getProviderPriceId('ENTERPRISE_BASE', currency) : null;

        const result = await this.provider.createSubscription({
            customerId,
            seatPriceId,
            basePriceId,
            quantity,
            successUrl,
            cancelUrl,
            companyId,
        });
        return result;
    }

    /**
     * Change plan for a company (PRO <-> ENTERPRISE). SUPER_ADMIN only.
     * Quantity is preserved: the provider carries over the LIVE quantity already
     * on the subscription, not company.purchasedSeats (that column is a
     * webhook-synced read model and may be stale, see ChangePlanInput).
     */
    async changePlanForCompany(companyId: string, plan: BillingPlan): Promise<void> {
        const company = await this.findCompany(companyId);
        if (!company.billingSubscriptionId || !company.billingCustomerId) {
            throw new BadRequestException('Company does not have an active subscription');
        }
        const currency = resolveBillingCurrency(company.defaultRegionCode);
        const seatPriceId = await this.getProviderPriceId('SEAT', currency);
        const basePriceId =
            plan === 'ENTERPRISE' ? await this.getProviderPriceId('ENTERPRISE_BASE', currency) : null;

        await this.provider.changePlan({
            subscriptionId: company.billingSubscriptionId,
            customerId: company.billingCustomerId,
            plan,
            seatPriceId,
            basePriceId,
        });
    }

    /**
     * Cancel the subscription at period end (COMPANY_ADMIN or SUPER_ADMIN).
     *
     * Downgrade to FREE is blocked with 409 when the company has more than
     * 1 active user (they must be removed or deactivated first via unit 5).
     */
    async cancelSubscription(companyId: string): Promise<void> {
        const company = await this.findCompany(companyId);
        if (!company.billingSubscriptionId || !company.billingCustomerId) {
            throw new BadRequestException('Company does not have an active subscription to cancel');
        }

        const activeUsers = await this.countActiveUsers(companyId);
        if (activeUsers > 1) {
            throw new ConflictException(
                `Cannot cancel: company has ${activeUsers} active users. ` +
                `Remove or deactivate all but 1 before downgrading to FREE.`,
            );
        }

        await this.provider.cancel({
            subscriptionId: company.billingSubscriptionId,
            customerId: company.billingCustomerId,
        });
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async findCompany(companyId: string): Promise<Company> {
        const company = await this.companyRepo.findOne({ where: { id: companyId } });
        if (!company) throw new NotFoundException(`Company ${companyId} not found`);
        return company;
    }

    /** Allowed redirect origins for hosted-checkout return URLs (same source as CORS). */
    private getAllowedOrigins(): string[] {
        const raw = this.config.get<string>('CORS_ORIGIN');
        const origins = raw
            ? raw.split(',').map((o) => o.trim()).filter(Boolean)
            : ['http://localhost:4200'];
        return origins.map((o) => o.replace(/\/+$/, ''));
    }

    /**
     * Guard the success/cancel URLs handed to the billing provider. They are
     * client-supplied, so an unvalidated value is an open-redirect / phishing
     * vector: reject anything that is not an absolute http(s) URL on an allowed
     * origin (the same allowlist used for CORS).
     */
    private assertAllowedRedirectUrl(url: string, field: string): void {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new BadRequestException(`${field} must be an absolute http(s) URL`);
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new BadRequestException(`${field} must be an http(s) URL`);
        }
        if (!this.getAllowedOrigins().includes(parsed.origin)) {
            throw new BadRequestException(`${field} is not an allowed redirect origin`);
        }
    }

    /** Count active (isActive=true) users for a company. */
    private async countActiveUsers(companyId: string): Promise<number> {
        return this.userRepo.count({ where: { companyId, isActive: true } });
    }

    /**
     * Resolve the provider price id for (kind, currency). Throws if not found or
     * not yet synced to Stripe (providerPriceId is null).
     */
    private async getProviderPriceId(
        kind: 'SEAT' | 'ENTERPRISE_BASE',
        currency: string,
    ): Promise<string> {
        const row = await this.priceRepo.findOne({
            where: { kind, currency, active: true },
        });
        if (!row) {
            throw new BadRequestException(
                `No active ${kind} price found for currency ${currency}. ` +
                `Run POST /billing/prices/sync first.`,
            );
        }
        if (!row.providerPriceId) {
            throw new BadRequestException(
                `${kind} price for ${currency} has not been synced to Stripe yet. ` +
                `Run POST /billing/prices/sync first.`,
            );
        }
        return row.providerPriceId;
    }
}
