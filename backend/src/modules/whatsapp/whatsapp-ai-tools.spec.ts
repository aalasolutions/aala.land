import { executeTool, TOOL_DEFINITIONS } from './whatsapp-ai-tools';

const makeRepo = () => ({
  searchProperties: jest.fn().mockResolvedValue({ units: [], total: 0 }),
});
const makePromptBuilder = () => ({
  formatToolResult: jest
    .fn()
    .mockReturnValue('No properties found matching your criteria.'),
});

describe('TOOL_DEFINITIONS', () => {
  it('contains search_properties and escalate_to_human', () => {
    const names = TOOL_DEFINITIONS.map((t: any) => t.function.name);
    expect(names).toContain('search_properties');
    expect(names).toContain('escalate_to_human');
  });

  it('search_properties has no required parameters', () => {
    const tool = TOOL_DEFINITIONS.find(
      (t: any) => t.function.name === 'search_properties',
    ) as any;
    expect(tool.function.parameters.required).toEqual([]);
  });
});

describe('executeTool', () => {
  let repo: ReturnType<typeof makeRepo>;
  let promptBuilder: ReturnType<typeof makePromptBuilder>;

  beforeEach(() => {
    repo = makeRepo();
    promptBuilder = makePromptBuilder();
  });

  it('returns escalation message for escalate_to_human', async () => {
    const result = await executeTool(
      'escalate_to_human',
      {},
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(typeof result).toBe('string');
    expect(result.toLowerCase()).toContain('escalat');
    expect(repo.searchProperties).not.toHaveBeenCalled();
  });

  it('calls searchProperties with companyId and filters', async () => {
    await executeTool(
      'search_properties',
      { city: 'Karachi', minBedrooms: 2 },
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(repo.searchProperties).toHaveBeenCalledWith('c1', 'u1', {
      city: 'Karachi',
      minBedrooms: 2,
    });
  });

  it('parses place, amenities, bathrooms, size and sort, and drops invalid values', async () => {
    await executeTool(
      'search_properties',
      {
        place: '  Marina ',
        amenities: 'pool, parking,,',
        minBathrooms: '2.4',
        maxSqft: '1500',
        sort: 'price_low',
        type: 'LEASE',
        minPrice: 'cheap',
      },
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(repo.searchProperties).toHaveBeenCalledWith('c1', 'u1', {
      place: 'Marina',
      amenities: ['pool', 'parking'],
      minBathrooms: 2.5,
      maxSqft: 1500,
      sort: 'price_low',
    });
  });

  it('ignores an unknown sort and caps amenities at five', async () => {
    await executeTool(
      'search_properties',
      { sort: 'random', amenities: ['a', 'b', 'c', 'd', 'e', 'f'] },
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(repo.searchProperties).toHaveBeenCalledWith('c1', 'u1', {
      amenities: ['a', 'b', 'c', 'd', 'e'],
    });
  });

  it('returns formatToolResult output when listings found', async () => {
    repo.searchProperties.mockResolvedValue({
      units: [{ id: 'l1' }],
      total: 3,
    });
    promptBuilder.formatToolResult.mockReturnValue('1 listing found');
    const result = await executeTool(
      'search_properties',
      {},
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(result).toBe('1 listing found');
    expect(promptBuilder.formatToolResult).toHaveBeenCalledWith(
      [{ id: 'l1' }],
      3,
      'USD',
      undefined,
    );
  });

  it('returns no-results message when listings empty', async () => {
    repo.searchProperties.mockResolvedValue({ units: [], total: 0 });
    const result = await executeTool(
      'search_properties',
      {},
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(result).toBe('No properties found matching your criteria.');
  });

  it('returns unknown tool result for unrecognized tool name', async () => {
    const result = await executeTool(
      'unknown_tool',
      {},
      'c1',
      'u1',
      repo as any,
      promptBuilder as any,
      'USD',
    );
    expect(result).toBe('Unknown tool.');
  });
});
