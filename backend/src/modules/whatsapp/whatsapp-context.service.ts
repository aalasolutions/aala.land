import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { REGIONS } from '../../shared/constants/regions';

interface ContextCacheEntry {
  block: string;
  cachedAt: number;
}

@Injectable()
export class WhatsappContextService {
  private readonly logger = new Logger(WhatsappContextService.name);
  private cache = new Map<string, ContextCacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
  ) {}

  async getContextBlock(companyId: string): Promise<string> {
    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.block;
    }

    try {
      const block = await this.buildContextBlock(companyId);
      this.cache.set(companyId, { block, cachedAt: Date.now() });
      return block;
    } catch (err) {
      this.logger.error('Failed to build context block', err instanceof Error ? err.message : err);
      return '';
    }
  }

  clearCache(companyId?: string): void {
    companyId ? this.cache.delete(companyId) : this.cache.clear();
  }

  private async buildContextBlock(companyId: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    const parts: string[] = [];

    const fallbackCurrency = REGIONS.find(r => (company?.activeRegions ?? []).includes(r.code))?.currency ?? '';

    if (company) {
      const regions = (company.activeRegions ?? []).join(', ');
      parts.push(
        `[COMPANY INFO]\nName: ${company.name}\nActive Regions: ${regions || 'N/A'}`,
      );
    }

    {
      const units = await this.unitRepo.find({
        where: { companyId, status: UnitStatus.AVAILABLE },
        relations: ['asset', 'asset.locality', 'asset.locality.city'],
        order: { createdAt: 'DESC' },
        take: 40,
      });

      if (units.length > 0) {
        const lines = units.map((u, i) => {
          const asset = u.asset;
          const locality = asset?.locality;
          const city = (locality as any)?.city;
          const cityRegionCode = (city as any)?.regionCode;
          const unitCurrency = (cityRegionCode ? REGIONS.find(r => r.code === cityRegionCode)?.currency : undefined) ?? fallbackCurrency;
          const location = [asset?.name, locality?.name, city?.name].filter(Boolean).join(', ');
          const beds = u.bedrooms ? `${u.bedrooms} Bed` : 'Studio';
          const baths = u.bathrooms ? `${u.bathrooms} Bath` : '';
          const sqft = u.sqFt ? `${u.sqFt} sqft` : '';
          const amenities = (u.amenities ?? []).join(', ');
          const photos = (u.photos ?? []).slice(0, 3);
          const price = u.price ? `${unitCurrency} ${Number(u.price).toLocaleString()}` : 'Price on request';

          const rows = [
            `${i + 1}. Unit ${u.unitNumber} — ${price}`,
            `   Location: ${location || 'N/A'}`,
            asset?.address ? `   Address: ${asset.address}` : '',
            `   Size: ${[beds, baths, sqft].filter(Boolean).join(' | ')}`,
          ].filter(Boolean);
          if (amenities) rows.push(`   Amenities: ${amenities}`);
          if (photos.length) rows.push(`   Photos: ${photos.join(', ')}`);
          if (u.description) rows.push(`   Details: ${u.description.slice(0, 200)}`);
          return rows.join('\n');
        });

        parts.push(`[AVAILABLE PROPERTIES]\n${lines.join('\n\n')}`);
      } else {
        parts.push('[AVAILABLE PROPERTIES]\nNo available properties at this time.');
      }
    }

    parts.push(
      `[RULES]\n` +
      `- Only answer using information from the COMPANY INFO and AVAILABLE PROPERTIES sections above.\n` +
      `- If you do not have the requested information, say "I don't have that information — please contact our office directly" and nothing more. Do not make up details, teams, departments, or promises.\n` +
      `- You cannot book appointments, forward requests, or take any action — you only answer questions.\n` +
      `- Do not discuss: tenant details, lease agreements, cheque/payment records, owner details, or user accounts.`,
    );

    return parts.join('\n\n');
  }
}
