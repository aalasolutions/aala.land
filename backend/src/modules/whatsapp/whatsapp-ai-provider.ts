import { envFloat, envInt, envString } from '@shared/utils/env.util';
import type { ChatMessage, ToolDefinition } from './whatsapp-ai-filter';
import type { AiHistoryMessage } from './wa-types';

export type AiProviderProfileName =
  | 'openai-compatible'
  | 'gemma-vllm'
  | 'anthropic-openai-compat'
  | 'mistral';

export type MaxTokensField = 'max_tokens' | 'max_completion_tokens';

export interface AiProviderProfile {
  readonly name: AiProviderProfileName;
  readonly sendsTemperature: 'always' | 'only_when_one';
  readonly sendsTopP: boolean;
  readonly maxTokensField: MaxTokensField;
  readonly maxTokensFieldFromEnv: boolean;
  readonly reasoningFields: readonly string[];
  readonly detectsToolCallText: boolean;
  readonly extraBodyKeys: readonly string[];
  readonly supportsFrequencyPenalty: boolean;
  readonly toolMessagesWithoutTools: boolean;
}

export const DEFAULT_AI_PROVIDER_PROFILE: AiProviderProfileName =
  'openai-compatible';

// Sampling and host switches only; nothing that changes the reply's shape, stop point or tool use.
const OPEN_EXTRA_BODY_KEYS: readonly string[] = [
  'chat_template_kwargs',
  'top_k',
  'min_p',
  'repetition_penalty',
  'seed',
  'user',
  'reasoning_effort',
  'service_tier',
  'metadata',
  'store',
];

export const AI_PROVIDER_PROFILES: Readonly<
  Record<AiProviderProfileName, AiProviderProfile>
> = {
  'openai-compatible': {
    name: 'openai-compatible',
    sendsTemperature: 'always',
    sendsTopP: true,
    maxTokensField: 'max_tokens',
    maxTokensFieldFromEnv: true,
    reasoningFields: ['reasoning_content', 'reasoning'],
    detectsToolCallText: true,
    extraBodyKeys: OPEN_EXTRA_BODY_KEYS,
    supportsFrequencyPenalty: true,
    toolMessagesWithoutTools: false,
  },
  'gemma-vllm': {
    name: 'gemma-vllm',
    sendsTemperature: 'always',
    sendsTopP: true,
    maxTokensField: 'max_tokens',
    maxTokensFieldFromEnv: false,
    reasoningFields: ['reasoning_content', 'reasoning'],
    detectsToolCallText: true,
    extraBodyKeys: OPEN_EXTRA_BODY_KEYS.filter(
      (key) =>
        !['reasoning_effort', 'service_tier', 'metadata', 'store'].includes(
          key,
        ),
    ),
    supportsFrequencyPenalty: true,
    toolMessagesWithoutTools: true,
  },
  'anthropic-openai-compat': {
    name: 'anthropic-openai-compat',
    sendsTemperature: 'only_when_one',
    sendsTopP: false,
    maxTokensField: 'max_tokens',
    maxTokensFieldFromEnv: false,
    reasoningFields: [],
    detectsToolCallText: false,
    extraBodyKeys: ['thinking'],
    supportsFrequencyPenalty: false,
    toolMessagesWithoutTools: false,
  },
  mistral: {
    name: 'mistral',
    sendsTemperature: 'always',
    sendsTopP: true,
    maxTokensField: 'max_tokens',
    maxTokensFieldFromEnv: false,
    reasoningFields: [],
    detectsToolCallText: false,
    extraBodyKeys: ['safe_prompt', 'random_seed'],
    supportsFrequencyPenalty: true,
    toolMessagesWithoutTools: false,
  },
};

export const RESERVED_REQUEST_KEYS: ReadonlySet<string> = new Set([
  'tools',
  'tool_choice',
  'n',
  'messages',
  'model',
  'stream',
  'frequency_penalty',
  'max_tokens',
  'max_completion_tokens',
  'temperature',
  'top_p',
]);

// Tool calls some hosts write into content instead of tool_calls.
const TOOL_CALL_TEXT =
  /<\|?\/?tool_(call|response)|"tool_calls?"\s*:|\bcall:\w+\{/;

export interface AiProviderSettings {
  profile: string | undefined;
  host: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  temperature: number;
  topP: number;
  maxTokens: number;
  maxTokensField: string | undefined;
  retryFrequencyPenalty: number;
  extraBody: string | undefined;
}

export interface AiProvider {
  profile: AiProviderProfile;
  host: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  maxTokensField: MaxTokensField;
  retryFrequencyPenalty: number;
  extraBody: Record<string, unknown>;
  warnings: string[];
}

export type AiProviderSource = (companyId: string) => AiProviderSettings;

const envProviderSource: AiProviderSource = () => ({
  profile: envString('AI_PROVIDER_PROFILE'),
  host: envString('AI_BASE_URL'),
  apiKey: envString('AI_API_KEY'),
  model: envString('AI_MODEL'),
  temperature: envFloat('AI_TEMPERATURE', 0.7),
  topP: envFloat('AI_TOP_P', 0.9),
  maxTokens: envInt('AI_MAX_TOKENS', 2048, 1),
  maxTokensField: envString('AI_MAX_TOKENS_FIELD'),
  retryFrequencyPenalty: envFloat('AI_RETRY_FREQUENCY_PENALTY', 0.5),
  extraBody: envString('AI_EXTRA_BODY'),
});

const isProfileName = (value: string): value is AiProviderProfileName =>
  Object.keys(AI_PROVIDER_PROFILES).includes(value);

export function parseExtraBody(
  raw: string | undefined,
  profile: AiProviderProfile,
): { body: Record<string, unknown>; warnings: string[] } {
  if (!raw) return { body: {}, warnings: [] };
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    value = null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      body: {},
      warnings: ['AI_EXTRA_BODY is not a JSON object; ignored'],
    };
  }
  const body: Record<string, unknown> = {};
  const reserved: string[] = [];
  const unsupported: string[] = [];
  for (const [key, field] of Object.entries(value)) {
    if (RESERVED_REQUEST_KEYS.has(key)) reserved.push(key);
    else if (!profile.extraBodyKeys.includes(key)) {
      unsupported.push(key);
    } else body[key] = field;
  }
  const warnings: string[] = [];
  if (reserved.length > 0) {
    warnings.push(
      `AI_EXTRA_BODY cannot set ${reserved.join(', ')}; dropped (the loop owns these fields)`,
    );
  }
  if (unsupported.length > 0) {
    warnings.push(
      `AI_EXTRA_BODY keys ${unsupported.join(', ')} are not accepted by profile ${profile.name}; dropped`,
    );
  }
  return { body, warnings };
}

export function buildAiProvider(settings: AiProviderSettings): AiProvider {
  const warnings: string[] = [];
  let name = DEFAULT_AI_PROVIDER_PROFILE;
  if (settings.profile) {
    if (isProfileName(settings.profile)) name = settings.profile;
    else {
      warnings.push(
        `AI_PROVIDER_PROFILE "${settings.profile}" is unknown; using ${DEFAULT_AI_PROVIDER_PROFILE}`,
      );
    }
  }
  const profile = AI_PROVIDER_PROFILES[name];
  const extra = parseExtraBody(settings.extraBody, profile);
  warnings.push(...extra.warnings);
  if (
    profile.sendsTemperature === 'only_when_one' &&
    settings.temperature !== 1
  ) {
    warnings.push(
      `AI_TEMPERATURE ${settings.temperature} is not sent with profile ${profile.name}; only 1 is accepted`,
    );
  }
  const maxTokensField: MaxTokensField =
    profile.maxTokensFieldFromEnv &&
    settings.maxTokensField === 'max_completion_tokens'
      ? 'max_completion_tokens'
      : profile.maxTokensField;
  return {
    profile,
    host: settings.host ?? '',
    apiKey: settings.apiKey ?? '',
    model: settings.model ?? '',
    temperature: settings.temperature,
    topP: settings.topP,
    maxTokens: settings.maxTokens,
    maxTokensField,
    retryFrequencyPenalty: settings.retryFrequencyPenalty,
    extraBody: extra.body,
    warnings,
  };
}

// The one place a turn learns its provider; a per-company source can replace the env one.
export function resolveAiProvider(
  companyId: string,
  source: AiProviderSource = envProviderSource,
): Promise<AiProvider> {
  return Promise.resolve(buildAiProvider(source(companyId)));
}

export function isAiProviderConfigured(provider: AiProvider): boolean {
  return !!provider.host && !!provider.apiKey && !!provider.model;
}

export interface CompletionRequestInput {
  messages: AiHistoryMessage[];
  tools: ToolDefinition[];
  allowTools: boolean;
  nudged: boolean;
}

export function buildCompletionBody(
  provider: AiProvider,
  input: CompletionRequestInput,
): Record<string, unknown> {
  const { profile } = provider;
  const body: Record<string, unknown> = {
    ...provider.extraBody,
    model: provider.model,
    messages: input.messages,
    stream: false,
    [provider.maxTokensField]: provider.maxTokens,
  };
  if (profile.sendsTemperature === 'always') {
    body['temperature'] = provider.temperature;
  } else if (provider.temperature === 1) {
    body['temperature'] = 1;
  }
  if (profile.sendsTopP) body['top_p'] = provider.topP;
  if (input.tools.length > 0) {
    if (input.allowTools) body['tools'] = input.tools;
    else if (!profile.toolMessagesWithoutTools) {
      body['tools'] = input.tools;
      body['tool_choice'] = 'none';
    }
  }
  if (
    input.nudged &&
    profile.supportsFrequencyPenalty &&
    provider.retryFrequencyPenalty !== 0
  ) {
    body['frequency_penalty'] = provider.retryFrequencyPenalty;
  }
  return body;
}

export function reasoningText(
  profile: AiProviderProfile,
  message: ChatMessage,
): string | null {
  const fields = message as unknown as Record<string, unknown>;
  for (const name of profile.reasoningFields) {
    const value = fields[name];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

export function toolCallTextPattern(profile: AiProviderProfile): RegExp | null {
  return profile.detectsToolCallText ? TOOL_CALL_TEXT : null;
}
