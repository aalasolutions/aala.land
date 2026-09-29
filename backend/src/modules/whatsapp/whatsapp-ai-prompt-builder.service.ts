import { Injectable } from '@nestjs/common';
import { Company } from '../companies/entities/company.entity';
import { Unit } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import { REGIONS } from '../../shared/constants/regions';
import {
  COMPANY_NOTES_HEADER,
  DEFAULT_PROMPT,
  RULES_BLOCK,
} from './whatsapp-ai-prompts';
import { cleanAdminText } from './whatsapp-ai-filter';

// Keys are the search_properties sort values; the result header must name the order actually used.
const SORT_LABELS: Record<string, string> = {
  price_low: 'cheapest',
  price_high: 'most expensive',
  largest: 'largest',
  newest: 'newest',
};

// The model receives no file, only what kind of file arrived.
const MEDIA_TURN_NOUNS: Record<string, string> = {
  image: 'a photo',
  video: 'a video',
  audio: 'a voice message',
  document: 'a document',
  sticker: 'a sticker',
};

@Injectable()
export class WhatsappAiPromptBuilderService {
  buildMediaTurnText(mediaType: string, caption: string): string {
    const noun = MEDIA_TURN_NOUNS[mediaType] ?? 'a file';
    const line = `The customer sent ${noun}. You cannot view it.`;
    const text = caption.trim();
    return text ? `${line}\n${text}` : line;
  }

  buildContextBlock(company: Company | null): {
    block: string;
    fallbackCurrency: string;
  } {
    const parts: string[] = [];
    const fallbackCurrency =
      REGIONS.find((r) => (company?.activeRegions ?? []).includes(r.code))
        ?.currency ?? '';

    if (company) {
      parts.push(`[COMPANY INFO]\nName: ${company.name}`);
    }

    parts.push(RULES_BLOCK);
    return { block: parts.join('\n\n'), fallbackCurrency };
  }

  buildFullPrompt(companyNotes: string | null, contextBlock: string): string {
    const notes = companyNotes ? cleanAdminText(companyNotes) : '';
    return [
      DEFAULT_PROMPT,
      notes ? `${COMPANY_NOTES_HEADER}\n${notes}` : '',
      contextBlock,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  formatToolResult(
    units: Unit[],
    total: number,
    fallbackCurrency: string,
    sort?: string,
  ): string {
    if (units.length === 0)
      return 'No properties found matching your criteria.';
    const noun = total === 1 ? 'property' : 'properties';
    const header =
      total > units.length
        ? `Found ${total} ${noun}. Showing the ${SORT_LABELS[sort ?? ''] ?? 'newest'} ${units.length}.`
        : `Found ${total} ${noun}.`;
    return [header, ...this.formatUnits(units, fallbackCurrency)].join('\n\n');
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
      const location = [locality?.name, city?.name].filter(Boolean).join(', ');
      const beds = u.bedrooms ? `${u.bedrooms} Bed` : 'Studio';
      const baths = u.bathrooms ? `${u.bathrooms} Bath` : '';
      const sqft = u.sqFt ? `${u.sqFt} sqft` : '';
      const amenities = (u.amenities ?? []).join(', ');
      const typeLabel =
        u.propertyType === PropertyType.RENTAL
          ? 'For Rent: '
          : u.propertyType === PropertyType.FOR_SALE
            ? 'For Sale: '
            : '';
      const title = asset?.name
        ? `${asset.name}, unit ${u.unitNumber}`
        : `Unit ${u.unitNumber}`;

      const priceLabel =
        u.price != null
          ? `${currency} ${Number(u.price).toLocaleString()}`
          : 'Price on request';
      const rows = [
        `${i + 1}. ${typeLabel}${title}`,
        `   Price: ${priceLabel}`,
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
