import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import type { ToolDefinition } from './whatsapp-ai-filter';

export const SEARCH_SORTS = ['price_low', 'price_high', 'largest', 'newest'];

export interface PropertySearchFilters {
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSqft?: number;
  maxSqft?: number;
  city?: string;
  place?: string;
  amenities?: string[];
  type?: string;
  sort?: string;
}

const MAX_AMENITIES = 5;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description:
        'Search available property listings. The result starts with the total number of matches. Use for every question about properties, availability, prices, counts or specific units.',
      parameters: {
        type: 'object',
        properties: {
          minBedrooms: {
            type: 'integer',
            description:
              'Minimum bedrooms. "2+" or "at least 2" means minBedrooms 2. For exactly 2, set minBedrooms and maxBedrooms to 2. Studio is 0.',
          },
          maxBedrooms: {
            type: 'integer',
            description: 'Maximum bedrooms.',
          },
          minBathrooms: { type: 'integer', description: 'Minimum bathrooms.' },
          minPrice: { type: 'number', description: 'Minimum price.' },
          maxPrice: { type: 'number', description: 'Maximum price.' },
          minSqft: { type: 'number', description: 'Minimum size in sqft.' },
          maxSqft: { type: 'number', description: 'Maximum size in sqft.' },
          city: { type: 'string', description: 'City name, in English.' },
          place: {
            type: 'string',
            description:
              'Area, community or building name, in English (for example "Marina" or "Sunset Tower"). Spelling mistakes are tolerated.',
          },
          amenities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required amenities, for example ["pool", "parking"].',
          },
          type: {
            type: 'string',
            enum: ['RENT', 'SALE'],
            description: 'Filter by listing type: RENT or SALE',
          },
          sort: {
            type: 'string',
            enum: SEARCH_SORTS,
            description:
              'Order: price_low (cheapest first), price_high, largest, newest (default).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description:
        'Escalate the conversation to a human agent. Use when: the customer explicitly asks to speak to a human, requests a callback, expresses frustration, or the query is outside the scope of available information.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  companyId: string,
  userId: string,
  repo: WhatsappAiRepositoryService,
  promptBuilder: WhatsappAiPromptBuilderService,
  fallbackCurrency: string,
): Promise<string> {
  if (name === 'escalate_to_human') {
    return 'Escalation successful. Inform the customer that their request has been noted and a human agent will follow up with them shortly.';
  }
  if (name === 'search_properties') {
    const raw = args;
    const toNumber = (v: unknown) =>
      typeof v === 'number'
        ? v
        : typeof v === 'string' && v.trim()
          ? Number(v)
          : undefined;
    const count = (v: unknown) => {
      const n = toNumber(v);
      return Number.isFinite(n)
        ? Math.max(0, Math.floor(n as number))
        : undefined;
    };
    const amount = (v: unknown) => {
      const n = toNumber(v);
      return Number.isFinite(n) ? (n as number) : undefined;
    };
    const text = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
    const list = Array.isArray(raw.amenities)
      ? raw.amenities
      : typeof raw.amenities === 'string'
        ? raw.amenities.split(',')
        : [];

    const filters: PropertySearchFilters = {
      minBedrooms: count(raw.minBedrooms),
      maxBedrooms: count(raw.maxBedrooms),
      minBathrooms: count(raw.minBathrooms),
      minPrice: amount(raw.minPrice),
      maxPrice: amount(raw.maxPrice),
      minSqft: amount(raw.minSqft),
      maxSqft: amount(raw.maxSqft),
      city: text(raw.city, 100),
      place: text(raw.place, 100),
      amenities: list
        .map((a) => text(a, 50))
        .filter((a): a is string => Boolean(a))
        .slice(0, MAX_AMENITIES),
      type: raw.type === 'RENT' || raw.type === 'SALE' ? raw.type : undefined,
      sort:
        typeof raw.sort === 'string' && SEARCH_SORTS.includes(raw.sort)
          ? raw.sort
          : undefined,
    };
    const set = Object.fromEntries(
      Object.entries(filters).filter(
        ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
      ),
    ) as PropertySearchFilters;
    const { units, total } = await repo.searchProperties(
      companyId,
      userId,
      set,
    );
    return promptBuilder.formatToolResult(units, total, fallbackCurrency);
  }
  return 'Unknown tool.';
}
