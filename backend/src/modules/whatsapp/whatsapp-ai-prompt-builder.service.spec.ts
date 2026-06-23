import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import { DEFAULT_PROMPT, RULES_BLOCK } from './whatsapp-ai-prompts';

const makeCompany = (overrides = {}) => ({
  name: 'Test Co',
  activeRegions: [],
  ...overrides,
} as any);

describe('WhatsappAiPromptBuilderService', () => {
  let service: WhatsappAiPromptBuilderService;

  beforeEach(() => {
    service = new WhatsappAiPromptBuilderService();
  });

  describe('buildContextBlock', () => {
    it('includes [COMPANY INFO] section when company exists', () => {
      const block = service.buildContextBlock(makeCompany(), [], []);
      expect(block).toContain('[COMPANY INFO]');
      expect(block).toContain('Test Co');
    });

    it('skips [COMPANY INFO] when company is null', () => {
      const block = service.buildContextBlock(null, [], []);
      expect(block).not.toContain('[COMPANY INFO]');
    });

    it('always includes RULES_BLOCK', () => {
      const block = service.buildContextBlock(null, [], []);
      expect(block).toContain('[RULES]');
    });

    it('does not include property listings in context block', () => {
      const listing = {
        type: 'SALE', title: 'Nice Apt', price: '1000000', featured: false,
        photos: [], contactPhone: null, contactEmail: null, description: null,
        unit: { bedrooms: 2, bathrooms: 1, sqFt: 900, amenities: [], photos: [], asset: null },
      };
      const block = service.buildContextBlock(makeCompany(), [listing as any], []);
      expect(block).not.toContain('Nice Apt');
      expect(block).not.toContain('[AVAILABLE PROPERTIES]');
    });
  });

  describe('formatToolResult', () => {
    it('returns no-results message for empty array', () => {
      expect(service.formatToolResult([])).toBe('No properties found matching your criteria.');
    });

    it('returns formatted listing string for non-empty array', () => {
      // Call buildContextBlock first to set fallbackCurrency
      service.buildContextBlock(makeCompany({ activeRegions: ['AE-DU'] }), [], []);
      const listing = {
        type: 'RENT',
        title: 'Nice Flat',
        price: '25000',
        featured: false,
        photos: [],
        contactPhone: '03001234567',
        contactEmail: null,
        description: 'A nice flat',
        unit: {
          bedrooms: 2, bathrooms: 1, sqFt: 900, amenities: [], photos: [],
          asset: {
            name: 'Sunset Tower', address: '12 Main St',
            locality: { name: 'DHA', city: { name: 'Karachi', regionCode: 'PK' } },
          },
        },
      };
      const result = service.formatToolResult([listing as any]);
      expect(typeof result).toBe('string');
      expect(result).toContain('Nice Flat');
      expect(result).toContain('25,000');
      expect(result).toContain('2 Bed');
      expect(result).toContain('03001234567');
    });
  });

  describe('buildFullPrompt', () => {
    it('returns DEFAULT_PROMPT when customPrompt is null and contextBlock is empty', () => {
      const result = service.buildFullPrompt(null, '');
      expect(result).toBe(DEFAULT_PROMPT);
    });

    it('returns custom prompt when provided and contextBlock is empty', () => {
      const result = service.buildFullPrompt('My custom prompt', '');
      expect(result).toBe('My custom prompt');
    });

    it('appends contextBlock to DEFAULT_PROMPT when customPrompt is null', () => {
      const result = service.buildFullPrompt(null, 'some context');
      expect(result).toContain(DEFAULT_PROMPT);
      expect(result).toContain('some context');
    });

    it('appends contextBlock to custom prompt when both provided', () => {
      const result = service.buildFullPrompt('Custom', 'Context data');
      expect(result).toContain('Custom');
      expect(result).toContain('Context data');
    });
  });
});
