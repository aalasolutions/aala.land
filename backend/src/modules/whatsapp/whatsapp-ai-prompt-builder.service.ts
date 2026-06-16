import { Injectable } from '@nestjs/common';
import { Company } from '../companies/entities/company.entity';
import { Listing } from '../properties/entities/listing.entity';
import { Unit } from '../properties/entities/unit.entity';
import { REGIONS } from '../../shared/constants/regions';
import { DEFAULT_PROMPT, RULES_BLOCK } from './whatsapp-ai-prompts';

@Injectable()
export class WhatsappAiPromptBuilderService {
  buildContextBlock(company: Company | null, listings: Listing[], units: Unit[]): string {
    const parts: string[] = [];
    const fallbackCurrency = REGIONS.find(r => (company?.activeRegions ?? []).includes(r.code))?.currency ?? '';

    if (company) {
      const regions = (company.activeRegions ?? []).join(', ');
      parts.push(`[COMPANY INFO]\nName: ${company.name}\nActive Regions: ${regions || 'N/A'}`);
    }

    const propertyLines = listings.length > 0
      ? this.formatListings(listings, fallbackCurrency)
      : this.formatUnits(units, fallbackCurrency);

    parts.push(
      propertyLines.length > 0
        ? `[AVAILABLE PROPERTIES]\n${propertyLines.join('\n\n')}`
        : '[AVAILABLE PROPERTIES]\nNo available properties at this time.',
    );

    parts.push(RULES_BLOCK);
    return parts.join('\n\n');
  }

  buildFullPrompt(customPrompt: string | null, contextBlock: string): string {
    const base = customPrompt ?? DEFAULT_PROMPT;
    return contextBlock ? `${base}\n\n${contextBlock}` : base;
  }

  private formatListings(listings: Listing[], fallbackCurrency: string): string[] {
    return listings.map((l, i) => {
      const u = l.unit;
      const asset = u?.asset;
      const locality = asset?.locality;
      const city = (locality as any)?.city;
      const cityRegionCode = (city as any)?.regionCode;
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

  private formatUnits(units: Unit[], fallbackCurrency: string): string[] {
    return units.map((u, i) => {
      const asset = u.asset;
      const locality = asset?.locality;
      const city = (locality as any)?.city;
      const cityRegionCode = (city as any)?.regionCode;
      const currency = (cityRegionCode ? REGIONS.find(r => r.code === cityRegionCode)?.currency : undefined) ?? fallbackCurrency;
      const location = [asset?.name, locality?.name, city?.name].filter(Boolean).join(', ');
      const beds = u.bedrooms ? `${u.bedrooms} Bed` : 'Studio';
      const baths = u.bathrooms ? `${u.bathrooms} Bath` : '';
      const sqft = u.sqFt ? `${u.sqFt} sqft` : '';
      const amenities = (u.amenities ?? []).join(', ');
      const photos = (u.photos ?? []).slice(0, 3);
      const price = u.price ? `${currency} ${Number(u.price).toLocaleString()}` : 'Price on request';

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
  }
}
