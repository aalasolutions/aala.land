import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import { PropertyType } from '../properties/entities/property-type.enum';
import { DEFAULT_PROMPT, RULES_BLOCK } from './whatsapp-ai-prompts';

const makeCompany = (overrides = {}) => ({
  name: 'Test Co',
  activeRegions: [],
  ...overrides,
} as any);

const makeUnit = (overrides = {}) => ({
  unitNumber: '1A',
  bedrooms: 2,
  bathrooms: 1,
  sqFt: 900,
  amenities: [],
  description: null,
  propertyType: PropertyType.RENTAL,
  price: '25000',
  asset: {
    name: 'Sunset Tower',
    address: '12 Main St',
    locality: { name: 'DHA', city: { name: 'Karachi', regionCode: 'PK' } },
  },
  ...overrides,
} as any);

describe('WhatsappAiPromptBuilderService', () => {
  let service: WhatsappAiPromptBuilderService;

  beforeEach(() => {
    service = new WhatsappAiPromptBuilderService();
  });

  describe('buildContextBlock', () => {
    it('includes [COMPANY INFO] section when company exists', () => {
      const { block } = service.buildContextBlock(makeCompany());
      expect(block).toContain('[COMPANY INFO]');
      expect(block).toContain('Test Co');
    });

    it('skips [COMPANY INFO] when company is null', () => {
      const { block } = service.buildContextBlock(null);
      expect(block).not.toContain('[COMPANY INFO]');
    });

    it('always includes RULES_BLOCK', () => {
      const { block } = service.buildContextBlock(null);
      expect(block).toContain(RULES_BLOCK);
    });
  });

  describe('formatToolResult', () => {
    it('returns no-results message for empty array', () => {
      expect(service.formatToolResult([], '')).toBe('No properties found matching your criteria.');
    });

    it('returns formatted unit string for non-empty array', () => {
      const { fallbackCurrency } = service.buildContextBlock(makeCompany({ activeRegions: ['AE-DU'] }));
      const unit = makeUnit();
      const result = service.formatToolResult([unit], fallbackCurrency);
      expect(typeof result).toBe('string');
      expect(result).toContain('Sunset Tower');
      expect(result).toContain('Unit 1A');
      expect(result).toContain('25,000');
      expect(result).toContain('2 Bed');
      expect(result).toContain('[RENT]');
    });

    it('labels FOR_SALE units as SALE', () => {
      const unit = makeUnit({ propertyType: PropertyType.FOR_SALE });
      const result = service.formatToolResult([unit], '');
      expect(result).toContain('[SALE]');
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
