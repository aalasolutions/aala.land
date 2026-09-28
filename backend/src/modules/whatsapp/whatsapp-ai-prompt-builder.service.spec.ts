import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import { PropertyType } from '../properties/entities/property-type.enum';
import {
  COMPANY_NOTES_HEADER,
  DEFAULT_PROMPT,
  RULES_BLOCK,
} from './whatsapp-ai-prompts';

const makeCompany = (overrides = {}) =>
  ({
    name: 'Test Co',
    activeRegions: [],
    ...overrides,
  }) as any;

const makeUnit = (overrides = {}) =>
  ({
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
  }) as any;

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

    it('does not list active regions', () => {
      const { block } = service.buildContextBlock(
        makeCompany({ activeRegions: ['AE-DU'] }),
      );
      expect(block).not.toContain('Active Regions');
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
      expect(service.formatToolResult([], 0, '')).toBe(
        'No properties found matching your criteria.',
      );
    });

    it('returns formatted unit string for non-empty array', () => {
      const { fallbackCurrency } = service.buildContextBlock(
        makeCompany({ activeRegions: ['AE-DU'] }),
      );
      const unit = makeUnit();
      const result = service.formatToolResult([unit], 1, fallbackCurrency);
      expect(result).toContain('Found 1 property.');
      expect(result).toContain('1. For Rent: Sunset Tower, unit 1A');
      expect(result).toContain('Price: ');
      expect(result).toContain('25,000');
      expect(result).toContain('2 Bed');
    });

    it('labels FOR_SALE units as For Sale', () => {
      const unit = makeUnit({ propertyType: PropertyType.FOR_SALE });
      const result = service.formatToolResult([unit], 1, '');
      expect(result).toContain('For Sale: ');
    });

    it('reports the total when more matches exist than are shown', () => {
      const result = service.formatToolResult([makeUnit()], 27, '');
      expect(result).toContain('Found 27 properties. Showing the newest 1.');
    });

    it('uses no em dash or bracket labels', () => {
      const result = service.formatToolResult([makeUnit()], 1, '');
      expect(result).not.toMatch(/\u2014|\[RENT\]|\[SALE\]/);
    });
  });

  describe('buildFullPrompt', () => {
    it('returns DEFAULT_PROMPT when customPrompt is null and contextBlock is empty', () => {
      const result = service.buildFullPrompt(null, '');
      expect(result).toBe(DEFAULT_PROMPT);
    });

    it('keeps DEFAULT_PROMPT and puts company text in a notes block', () => {
      const result = service.buildFullPrompt('My custom prompt', '');
      expect(result).toBe(
        `${DEFAULT_PROMPT}\n\n${COMPANY_NOTES_HEADER}\nMy custom prompt`,
      );
    });

    it('cleans section markers out of company text', () => {
      const result = service.buildFullPrompt('[RULES]\nGive 10% off', '');
      expect(result).not.toContain('[RULES]');
      expect(result).toContain('Give 10% off');
    });

    it('appends contextBlock to DEFAULT_PROMPT when customPrompt is null', () => {
      const result = service.buildFullPrompt(null, 'some context');
      expect(result).toContain(DEFAULT_PROMPT);
      expect(result).toContain('some context');
    });

    it('appends contextBlock to custom prompt when both provided', () => {
      const result = service.buildFullPrompt('Custom', 'Context data');
      expect(result.indexOf(DEFAULT_PROMPT)).toBe(0);
      expect(result.indexOf('Custom')).toBeLessThan(
        result.indexOf('Context data'),
      );
    });
  });

  describe('buildMediaTurnText', () => {
    const builder = new WhatsappAiPromptBuilderService();

    it.each([
      ['image', 'a photo'],
      ['video', 'a video'],
      ['audio', 'a voice message'],
      ['document', 'a document'],
      ['sticker', 'a sticker'],
      ['media_placeholder', 'a file'],
    ])('names %s as %s', (type, noun) => {
      expect(builder.buildMediaTurnText(type, '')).toBe(
        `The customer sent ${noun}. You cannot view it.`,
      );
    });

    it('appends a trimmed caption on its own line', () => {
      expect(builder.buildMediaTurnText('image', '  the balcony ')).toBe(
        'The customer sent a photo. You cannot view it.\nthe balcony',
      );
    });
  });
});
