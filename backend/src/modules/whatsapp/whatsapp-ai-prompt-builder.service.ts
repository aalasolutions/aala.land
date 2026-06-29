import { Injectable } from '@nestjs/common';
import { Company } from '../companies/entities/company.entity';
import { Listing } from '../properties/entities/listing.entity';
import { REGIONS } from '../../shared/constants/regions';
import { DEFAULT_PROMPT, RULES_BLOCK } from './whatsapp-ai-prompts';

@Injectable()
export class WhatsappAiPromptBuilderService {
  buildContextBlock(company: Company | null): { block: string; fallbackCurrency: string } {
    const parts: string[] = [];
    const fallbackCurrency = REGIONS.find(r => (company?.activeRegions ?? []).includes(r.code))?.currency ?? '';

    if (company) {
      const regions = (company.activeRegions ?? []).join(', ');
      parts.push(`[COMPANY INFO]\nName: ${company.name}\nActive Regions: ${regions || 'N/A'}`);
    }

    parts.push(RULES_BLOCK);
    return { block: parts.join('\n\n'), fallbackCurrency };
  }

  buildFullPrompt(customPrompt: string | null, contextBlock: string): string {
    const base = customPrompt ?? DEFAULT_PROMPT;
    return contextBlock ? `${base}\n\n${contextBlock}` : base;
  }

  formatToolResult(listings: Listing[], fallbackCurrency: string): string {
    if (listings.length === 0) return 'No properties found matching your criteria.';
    return this.formatListings(listings, fallbackCurrency).join('\n\n');
  }

  private formatListings(listings: Listing[], fallbackCurrency: string): string[] {
    return listings.map((l, i) => {
      const u = l.unit;
      const asset = u?.asset;
      const locality = asset?.locality;
      const city = locality?.city;
      const cityRegionCode = city?.regionCode;
      const currency = (cityRegionCode ? REGIONS.find(r => r.code === cityRegionCode)?.currency : undefined) ?? fallbackCurrency;
      const location = [asset?.name, locality?.name, city?.name].filter(Boolean).join(', ');
      const beds = u?.bedrooms ? `${u.bedrooms} Bed` : 'Studio';
      const baths = u?.bathrooms ? `${u.bathrooms} Bath` : '';
      const sqft = u?.sqFt ? `${u.sqFt} sqft` : '';
      const amenities = (u?.amenities ?? []).join(', ');
      const allPhotos = (l.photos ?? []).length ? l.photos : (u?.photos ?? []);
      const photos = allPhotos.slice(0, 3);
      const contact = [l.contactPhone, l.contactEmail].filter(Boolean).join(' / ');

      const rows = [
        `${i + 1}. [${l.type}] ${l.title} — ${currency} ${Number(l.price).toLocaleString()}`,
        `   Location: ${location || 'N/A'}`,
        asset?.address ? `   Address: ${asset.address}` : '',
        `   Size: ${[beds, baths, sqft].filter(Boolean).join(' | ')}`,
      ].filter(Boolean);
      if (amenities) rows.push(`   Amenities: ${amenities}`);
      if (photos.length) rows.push(`   Photos: ${photos.join(', ')}`);
      if (contact) rows.push(`   Contact: ${contact}`);
      if (l.description) rows.push(`   Details: ${l.description.slice(0, 200)}`);
      return rows.join('\n');
    });
  }

}
