import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { BillingPrice } from './entities/billing-price.entity';
import { BillingProvider, BILLING_PROVIDER } from './provider/billing-provider.interface';

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(
        @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
        @InjectRepository(BillingPrice) private readonly priceRepo: Repository<BillingPrice>,
        @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    ) {}

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
}
