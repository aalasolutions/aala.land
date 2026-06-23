const DANGEROUS_PATTERNS: RegExp[] = [
  /\bDROP\b/gi,
  /\bDELETE\b/gi,
  /\bREMOVE\b/gi,
  /\bUPDATE\b/gi,
  /\bINSERT\b/gi,
  /\bSELECT\b/gi,
  /--/g,
  /\/\*/g,
  /\*\//g,
  /`/g,
  /ignore\s+previous\s+instructions/gi,
  /you\s+are\s+now/gi,
  /\bact\s+as\b/gi,
];

export const DIRECT_CONTACT_RESPONSE = "I'm unable to process this request. Please contact our office directly.";

export function sanitizeInput(message: string): { cleaned: string; needsDirectContact: boolean } {
  let cleaned = message;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return { cleaned, needsDirectContact: cleaned.length === 0 };
}

export function parseResponse(raw: any): string | null {
  const content = raw?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string' || !content.trim()) return null;
  return content.trim();
}

export function parseToolCall(raw: any): { name: string; args: Record<string, unknown>; id: string } | null {
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
