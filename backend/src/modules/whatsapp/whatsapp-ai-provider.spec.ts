import {
  AI_PROVIDER_PROFILES,
  parseExtraBody,
  AiProviderSettings,
  buildCompletionBody,
  isAiProviderConfigured,
  reasoningText,
  resolveAiProvider,
} from './whatsapp-ai-provider';

const settings = (
  overrides: Partial<AiProviderSettings> = {},
): AiProviderSettings => ({
  profile: undefined,
  host: 'http://h',
  apiKey: 'k',
  model: 'm',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  maxTokensField: undefined,
  retryFrequencyPenalty: 0.5,
  extraBody: undefined,
  ...overrides,
});

describe('resolveAiProvider', () => {
  it('asks its source for the company it resolves, so a per-company source can replace the env one', async () => {
    const source = jest.fn((companyId: string) =>
      settings({
        profile:
          companyId === 'co-a' ? 'anthropic-openai-compat' : 'gemma-vllm',
      }),
    );

    const a = await resolveAiProvider('co-a', source);
    const b = await resolveAiProvider('co-b', source);

    expect(source).toHaveBeenCalledWith('co-a');
    expect(source).toHaveBeenCalledWith('co-b');
    expect(a.profile.name).toBe('anthropic-openai-compat');
    expect(b.profile.name).toBe('gemma-vllm');
  });

  it('defaults to the openai-compatible profile', async () => {
    const provider = await resolveAiProvider('co', () => settings());
    expect(provider.profile.name).toBe('openai-compatible');
    expect(provider.warnings).toEqual([]);
  });

  it('takes the max-tokens field from settings only for the generic profile', async () => {
    const generic = await resolveAiProvider('co', () =>
      settings({ maxTokensField: 'max_completion_tokens' }),
    );
    const mistral = await resolveAiProvider('co', () =>
      settings({ profile: 'mistral', maxTokensField: 'max_completion_tokens' }),
    );
    expect(generic.maxTokensField).toBe('max_completion_tokens');
    expect(mistral.maxTokensField).toBe('max_tokens');
  });

  it('is configured only with a host, a key and a model', async () => {
    expect(
      isAiProviderConfigured(await resolveAiProvider('co', () => settings())),
    ).toBe(true);
    expect(
      isAiProviderConfigured(
        await resolveAiProvider('co', () => settings({ model: undefined })),
      ),
    ).toBe(false);
  });
});

describe('buildCompletionBody', () => {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'search_properties',
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ];

  it('sends neither temperature nor top_p to the Anthropic profile below 1', async () => {
    const provider = await resolveAiProvider('co', () =>
      settings({ profile: 'anthropic-openai-compat', temperature: 0.2 }),
    );
    const body = buildCompletionBody(provider, {
      messages: [],
      tools,
      allowTools: true,
      nudged: true,
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('frequency_penalty');
    expect(body.tools).toBe(tools);
  });

  it('declares every profile field the loop reads', () => {
    for (const profile of Object.values(AI_PROVIDER_PROFILES)) {
      expect(profile).toEqual(
        expect.objectContaining({
          sendsTemperature: expect.any(String),
          sendsTopP: expect.any(Boolean),
          maxTokensField: expect.any(String),
          reasoningFields: expect.any(Array),
          detectsToolCallText: expect.any(Boolean),
          supportsFrequencyPenalty: expect.any(Boolean),
          toolMessagesWithoutTools: expect.any(Boolean),
        }),
      );
    }
  });
});

describe('reasoningText', () => {
  it('reads only the fields the profile names', () => {
    const message = {
      role: 'assistant',
      content: 'x',
      reasoning_content: 'thought',
    };
    expect(reasoningText(AI_PROVIDER_PROFILES['gemma-vllm'], message)).toBe(
      'thought',
    );
    expect(reasoningText(AI_PROVIDER_PROFILES.mistral, message)).toBeNull();
  });
});

describe('parseExtraBody', () => {
  it.each(['openai-compatible', 'gemma-vllm'] as const)(
    'keeps only allow-listed keys on %s',
    (name) => {
      const { body, warnings } = parseExtraBody(
        JSON.stringify({
          chat_template_kwargs: { enable_thinking: false },
          top_k: 20,
          stop: ['\n'],
          response_format: { type: 'json_object' },
          presence_penalty: 1,
          parallel_tool_calls: false,
        }),
        AI_PROVIDER_PROFILES[name],
      );
      expect(body).toEqual({
        chat_template_kwargs: { enable_thinking: false },
        top_k: 20,
      });
      expect(warnings).toEqual([
        `AI_EXTRA_BODY keys stop, response_format, presence_penalty, parallel_tool_calls are not accepted by profile ${name}; dropped`,
      ]);
    },
  );

  it('keeps thinking only on the Anthropic profile', () => {
    expect(
      parseExtraBody(
        '{"thinking":{"type":"disabled"},"top_k":5}',
        AI_PROVIDER_PROFILES['anthropic-openai-compat'],
      ).body,
    ).toEqual({ thinking: { type: 'disabled' } });
  });
});

describe('buildAiProvider warnings', () => {
  it('warns that the Anthropic profile drops a temperature other than 1', async () => {
    const provider = await resolveAiProvider('co', () =>
      settings({ profile: 'anthropic-openai-compat', temperature: 0.2 }),
    );
    expect(provider.warnings).toContain(
      'AI_TEMPERATURE 0.2 is not sent with profile anthropic-openai-compat; only 1 is accepted',
    );
  });
});
