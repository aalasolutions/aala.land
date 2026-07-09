import { Injectable } from '@nestjs/common';
import { Company } from '../companies/entities/company.entity';
import { Unit } from '../properties/entities/unit.entity';

import { REGIONS } from '../../shared/constants/regions';
import { DEFAULT_PROMPT, RULES_BLOCK } from './whatsapp-ai-prompts';

@Injectable()
export class WhatsappAiPromptBuilderService {
  buildContextBlock(company: Company | null): {
    block: string;
    fallbackCurrency: string;
  } {
    const parts: string[] = [];
    const fallbackCurrency =
      REGIONS.find((r) => (company?.activeRegions ?? []).includes(r.code))
        ?.currency ?? '';

    if (company) {
      const regions = (company.activeRegions ?? []).join(', ');
      parts.push(
        `[COMPANY INFO]\nName: ${company.name}\nActive Regions: ${regions || 'N/A'}`,
      );
    }

    parts.push(RULES_BLOCK);
    return { block: parts.join('\n\n'), fallbackCurrency };
  }

  buildFullPrompt(customPrompt: string | null, contextBlock: string): string {
    const base = customPrompt ?? DEFAULT_PROMPT;
    return contextBlock ? `${base}\n\n${contextBlock}` : base;
  }

  formatToolResult(units: Unit[], fallbackCurrency: string): string {
    if (units.length === 0)
      return 'No properties found matching your criteria.';
    return this.formatUnits(units, fallbackCurrency).join('\n\n');
  }

  private formatUnits(units: Unit[], fallbackCurrency: string): string[] {
    return units.map((u, i) => {
      const asset = u.asset;
      const locality = asset?.locality;
      const city = locality?.city;
      const cityRegionCode = city?.regionCode;
      const currency =
        (cityRegionCode
          ? REGIONS.find((r) => r.code === cityRegionCode)?.currency
          : undefined) ?? fallbackCurrency;
      const location = [asset?.name, locality?.name, city?.name]
        .filter(Boolean)
        .join(', ');
      const beds = u.bedrooms ? `${u.bedrooms} Bed` : 'Studio';
      const baths = u.bathrooms ? `${u.bathrooms} Bath` : '';
      const sqft = u.sqFt ? `${u.sqFt} sqft` : '';
      const amenities = (u.amenities ?? []).join(', ');
      const typeLabel =
        u.propertyType === 'RENTAL'
          ? 'RENT'
          : u.propertyType === 'FOR_SALE'
            ? 'SALE'
            : 'N/A';
      const title = asset?.name
        ? `${asset.name} — Unit ${u.unitNumber}`
        : `Unit ${u.unitNumber}`;

      const priceLabel =
        u.price != null
          ? `${currency} ${Number(u.price).toLocaleString()}`
          : 'Price on request';
      const rows = [
        `${i + 1}. [${typeLabel}] ${title} — ${priceLabel}`,
        `   Location: ${location || 'N/A'}`,
        asset?.address ? `   Address: ${asset.address}` : '',
        `   Size: ${[beds, baths, sqft].filter(Boolean).join(' | ')}`,
      ].filter(Boolean);
      if (amenities) rows.push(`   Amenities: ${amenities}`);
      if (u.description)
        rows.push(`   Details: ${u.description.slice(0, 200)}`);
      return rows.join('\n');
    });
  }
}
