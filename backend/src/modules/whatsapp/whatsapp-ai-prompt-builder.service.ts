import { Injectable } from '@nestjs/common';
import { Company } from '../companies/entities/company.entity';
import { Unit } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import { REGIONS } from '../../shared/constants/regions';
import {
  COMPANY_NOTES_HEADER,
  openingPrompt,
  RULES_BLOCK,
} from './whatsapp-ai-prompts';
import {
  cleanAdminText,
  MARKER_TOKEN,
  STAFF_LINE_PREFIX,
} from './whatsapp-ai-filter';

// Keys are the search_properties sort values; the result header must name the order actually used.
const SORT_LABELS: Record<string, string> = {
  price_low: 'cheapest',
  price_high: 'most expensive',
  largest: 'largest',
  newest: 'newest',
};

const NOTES_MAX_CHARS = 5000;
const COMPANY_NAME_MAX_CHARS = 120;

const BRACKETED = /[[\u3010]([^\]\u3011\n]{0,80})[\]\u3011]/g;
const SECTION_CAPS = /^[\sA-Z_-]+$/;
const SECTION_WORDS =
  /rule|team|staff|system|instruction|prompt|company|assistant/i;
const OVERRIDE_PHRASES = [
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,30}?\b(?:rules?|instructions?|prompt)\b(?:\s*#?\s*\d+)?/gi,
  /\b(?:new|updated|additional|extra)\s+(?:rules?|instructions?)\b/gi,
  /\brules?\s*#?\s*\d+\b/gi,
  /^[ \t]*rules?[ \t]*:/gim,
  /^[ \t]*(?:system|assistant|user|developer|tool)[ \t]*:/gim,
];

function neutralizeAdminText(text: string): string {
  let out = cleanAdminText(text).split(STAFF_LINE_PREFIX).join('');
  out = out.replace(BRACKETED, (match, inner: string) =>
    SECTION_CAPS.test(inner) || SECTION_WORDS.test(inner) ? '' : match,
  );
  for (const pattern of OVERRIDE_PHRASES) out = out.replace(pattern, '');
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const capName = (name: string): string =>
  name.replace(/\s+/g, ' ').trim().slice(0, COMPANY_NAME_MAX_CHARS).trim();

function cleanCompanyName(name: string): string {
  return (
    capName(neutralizeAdminText(name).replace(/[[\]【】<>{}]/g, '')) ||
    capName(name)
  );
}

// The model receives no file, only what kind of file arrived.
const MEDIA_TURN_NOUNS: Record<string, string> = {
  image: 'a photo',
  video: 'a video',
  audio: 'a voice message',
  document: 'a document',
  sticker: 'a sticker',
};

const MEDIA_TAG = `[MEDIA ${MARKER_TOKEN}]`;

// The line buildMediaTurnText writes for a media message; its per-process tag keeps typed text from passing as one.
export const MEDIA_TURN_LINE = new RegExp(
  `^\\[MEDIA ${MARKER_TOKEN}\\] The customer sent [^\\n]{1,40}\\. You cannot (?:view|listen to) it; say so and that staff can view it in this chat\\.$`,
);

@Injectable()
export class WhatsappAiPromptBuilderService {
  buildMediaTurnText(mediaType: string, caption: string): string {
    const noun = MEDIA_TURN_NOUNS[mediaType] ?? 'a file';
    const line = `${MEDIA_TAG} The customer sent ${noun}. You cannot ${mediaType === 'audio' ? 'listen to' : 'view'} it; say so and that staff can view it in this chat.`;
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

    const regions = REGIONS.filter((r) =>
      (company?.activeRegions ?? []).includes(r.code),
    ).map((r) => r.name);
    if (regions.length) {
      parts.push(`[COMPANY INFO]\nRegions: ${regions.join(', ')}`);
    }

    parts.push(RULES_BLOCK);
    return { block: parts.join('\n\n'), fallbackCurrency };
  }

  buildFullPrompt(
    companyNotes: string | null,
    contextBlock: string,
    companyName: string,
  ): string {
    const notes = companyNotes
      ? neutralizeAdminText(companyNotes).slice(0, NOTES_MAX_CHARS)
      : '';
    return [
      openingPrompt(cleanCompanyName(companyName)),
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
