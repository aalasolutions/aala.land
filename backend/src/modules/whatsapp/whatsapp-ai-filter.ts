export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ChatCompletion {
  choices: Array<{ message: ChatMessage }>;
}

export interface ToolDefinition {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: { type: string; properties: Record<string, unknown>; required: string[] };
  };
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+previous\s+instructions/gi,
  /you\s+are\s+now/gi,
  /\bact\s+as\b/gi,
];

export const DIRECT_CONTACT_RESPONSE = "I'm unable to process this request. Please contact our office directly.";

export function sanitizeInput(message: string): { cleaned: string; needsDirectContact: boolean } {
  let cleaned = message;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return { cleaned, needsDirectContact: cleaned.length === 0 };
}

export function parseResponse(raw: ChatCompletion | null): string | null {
  const content = raw?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string' || !content.trim()) return null;
  return content.trim();
}

export function parseToolCall(raw: ChatCompletion | null): { name: string; args: Record<string, unknown>; id: string } | null {
  const toolCalls = raw?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const first = toolCalls[0];
  try {
    const args = JSON.parse(first?.function?.arguments ?? '{}') as Record<string, unknown>;
    const name = first?.function?.name;
    const id = first?.id;
    if (!name || !id) return null;
    return { name, args, id };
  } catch {
    return null;
  }
}
