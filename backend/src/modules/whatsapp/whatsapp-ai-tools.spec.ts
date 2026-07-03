import { executeTool, TOOL_DEFINITIONS } from './whatsapp-ai-tools';

const makeRepo = () => ({
  searchProperties: jest.fn().mockResolvedValue([]),
});
const makePromptBuilder = () => ({
  formatToolResult: jest.fn().mockReturnValue('No properties found matching your criteria.'),
});

describe('TOOL_DEFINITIONS', () => {
  it('contains search_properties and escalate_to_human', () => {
    const names = TOOL_DEFINITIONS.map((t: any) => t.function.name);
    expect(names).toContain('search_properties');
    expect(names).toContain('escalate_to_human');
  });

  it('search_properties has no required parameters', () => {
    const tool = TOOL_DEFINITIONS.find((t: any) => t.function.name === 'search_properties') as any;
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
    const result = await executeTool('escalate_to_human', {}, 'c1', repo as any, promptBuilder as any, 'USD');
    expect(typeof result).toBe('string');
    expect(result.toLowerCase()).toContain('escalat');
    expect(repo.searchProperties).not.toHaveBeenCalled();
  });

  it('calls searchProperties with companyId and filters', async () => {
    await executeTool('search_properties', { city: 'Karachi', bedrooms: 2 }, 'c1', repo as any, promptBuilder as any, 'USD');
    expect(repo.searchProperties).toHaveBeenCalledWith('c1', { city: 'Karachi', bedrooms: 2 });
  });

  it('returns formatToolResult output when listings found', async () => {
    repo.searchProperties.mockResolvedValue([{ id: 'l1' }]);
    promptBuilder.formatToolResult.mockReturnValue('1 listing found');
    const result = await executeTool('search_properties', {}, 'c1', repo as any, promptBuilder as any, 'USD');
    expect(result).toBe('1 listing found');
  });

  it('returns no-results message when listings empty', async () => {
    repo.searchProperties.mockResolvedValue([]);
    const result = await executeTool('search_properties', {}, 'c1', repo as any, promptBuilder as any, 'USD');
    expect(result).toBe('No properties found matching your criteria.');
  });

  it('returns unknown tool result for unrecognized tool name', async () => {
    const result = await executeTool('unknown_tool', {}, 'c1', repo as any, promptBuilder as any, 'USD');
    expect(result).toBe('Unknown tool.');
  });
});
