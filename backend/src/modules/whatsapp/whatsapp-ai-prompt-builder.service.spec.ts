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

    it('shows "No available properties" when both listings and units are empty', () => {
      const block = service.buildContextBlock(makeCompany(), [], []);
      expect(block).toContain('No available properties at this time');
    });

    it('always includes RULES_BLOCK', () => {
      const block = service.buildContextBlock(null, [], []);
      expect(block).toContain('[RULES]');
    });

    it('uses listings when provided, ignores units', () => {
      const listing = {
        type: 'SALE', title: 'Nice Apt', price: '1000000', featured: false,
        photos: [], contactPhone: null, contactEmail: null, description: null,
        unit: {
          bedrooms: 2, bathrooms: 1, sqFt: 900, amenities: [], photos: [],
          asset: {
            name: 'Tower A', address: null,
            locality: { name: 'JBR', city: { name: 'Dubai', regionCode: 'AE-DU' } },
          },
        },
      };
      const unit = { unitNumber: 'U1', price: '500000' } as any;
      const block = service.buildContextBlock(makeCompany({ activeRegions: ['AE-DU'] }), [listing as any], [unit]);
      expect(block).toContain('Nice Apt');
      expect(block).not.toContain('U1');
    });

    it('falls back to units when listings are empty', () => {
      const unit = {
        unitNumber: 'U1', price: '500000', bedrooms: 1, bathrooms: 1,
        sqFt: 600, amenities: [], photos: [], description: null,
        asset: {
          name: 'Tower B', address: null,
          locality: { name: 'Downtown', city: { name: 'Dubai', regionCode: 'AE-DU' } },
        },
      };
      const block = service.buildContextBlock(makeCompany({ activeRegions: ['AE-DU'] }), [], [unit as any]);
      expect(block).toContain('U1');
    });

    it('includes listing contact info when available', () => {
      const listing = {
        type: 'RENT', title: 'Studio', price: '50000', featured: false,
        photos: [], contactPhone: '+971501234567', contactEmail: null, description: null,
        unit: {
          bedrooms: 0, bathrooms: 1, sqFt: 400, amenities: [], photos: [],
          asset: { name: 'Bldg', address: null, locality: { name: 'JLT', city: { name: 'Dubai', regionCode: null } } },
        },
      };
      const block = service.buildContextBlock(makeCompany(), [listing as any], []);
      expect(block).toContain('+971501234567');
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
