import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import type { ToolDefinition } from './whatsapp-ai-filter';

export interface PropertySearchFilters {
  bedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  type?: string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description:
        'Search available property listings. Use when the customer asks about properties, availability, prices, or wants to find a specific type of unit. Call with no filters to list all available properties.',
      parameters: {
        type: 'object',
        properties: {
          bedrooms: {
            type: 'integer',
            description: 'Filter by number of bedrooms',
          },
          minPrice: { type: 'number', description: 'Minimum price filter' },
          maxPrice: { type: 'number', description: 'Maximum price filter' },
          city: { type: 'string', description: 'Filter by city name' },
          type: {
            type: 'string',
            enum: ['RENT', 'SALE'],
            description: 'Filter by listing type: RENT or SALE',
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
  repo: WhatsappAiRepositoryService,
  promptBuilder: WhatsappAiPromptBuilderService,
  fallbackCurrency: string,
): Promise<string> {
  if (name === 'escalate_to_human') {
    return 'Escalation successful. Inform the customer that their request has been noted and a human agent will follow up with them shortly.';
  }
  if (name === 'search_properties') {
    const raw = args as any;
    const toNumber = (v: unknown) =>
      typeof v === 'number'
        ? v
        : typeof v === 'string' && v.trim()
          ? Number(v)
          : undefined;
    const filters: PropertySearchFilters = {};
    const bedrooms = toNumber(raw.bedrooms);
    if (Number.isFinite(bedrooms))
      filters.bedrooms = Math.max(0, Math.floor(bedrooms as number));
    const minPrice = toNumber(raw.minPrice);
    if (Number.isFinite(minPrice)) filters.minPrice = minPrice as number;
    const maxPrice = toNumber(raw.maxPrice);
    if (Number.isFinite(maxPrice)) filters.maxPrice = maxPrice as number;
    if (typeof raw.city === 'string' && raw.city.trim())
      filters.city = raw.city.trim().slice(0, 100);
    if (raw.type === 'RENT' || raw.type === 'SALE') filters.type = raw.type;
    const listings = await repo.searchProperties(companyId, filters);
    return promptBuilder.formatToolResult(listings, fallbackCurrency);
  }
  return 'Unknown tool.';
}
