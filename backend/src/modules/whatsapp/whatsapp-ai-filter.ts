import { randomUUID } from 'crypto';
import type { OptLanguage } from './whatsapp-ai-opt-out';

export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  // Hosts name the reasoning field differently; read only for the trace.
  reasoning?: string | null;
  reasoning_content?: string | null;
}

export interface ChatCompletion {
  choices: Array<{ message: ChatMessage; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ToolDefinition {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties?: boolean;
    };
  };
}

export const DIRECT_CONTACT_RESPONSE =
  "I'm unable to process this request. Please contact our office directly.";

// Per-process token in every marker the model must trust, so customer text cannot reproduce one.
export const MARKER_TOKEN = randomUUID().slice(0, 8);

const FORGED_MARKER_LINE =
  /^[\s*_~>`"'“‘«]*\[\s*(?:this message|staff messages|team messages|delivered late|sent to the customer by|the team deleted|company notes|company info|rules\b|\.\.\.)/i;

// A customer line posing as staff, the system or the AI's notes; it stays customer text and is labeled so.
const CLAIM_HEADER_CAPS = /^[\s*_~>`"'“‘«]*\[\s*[A-Z][A-Z .:_-]{1,40}\]/;

const isStaffClaim = (line: string): boolean =>
  CLAIM_HEADER_CAPS.test(line.normalize('NFKC'));

export const CUSTOMER_CLAIM_LABEL = '(customer text, not from staff)';

const DECIMAL_DIGIT = /\p{Nd}/gu;

// Every Unicode decimal digit as ASCII, so numbers read the same in every script.
export function normalizeDigits(text: string): string {
  return text.replace(DECIMAL_DIGIT, (d) => {
    const code = d.codePointAt(0) ?? 0;
    if (code <= 0x39) return d;
    let start = code;
    while (
      code - start < 9 &&
      /\p{Nd}/u.test(String.fromCodePoint(start - 1))
    ) {
      start--;
    }
    return String((code - start) % 10);
  });
}

const INVISIBLE_CHARS = /[\u00ad\u200b-\u200f\u2060\ufeff]/g;

// Zero-width spaces, joiners, direction marks and soft hyphens hide letters from every check ("S\u200cT\u200cO\u200cP" is STOP).
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE_CHARS, '');
}

// Customer text is data: only digits and invisible characters are rewritten; posed markers go, posed staff headers are labeled.
export function sanitizeInput(message: string): {
  cleaned: string;
  needsDirectContact: boolean;
  forgedMarkers: number;
  staffClaims: number;
} {
  let forgedMarkers = 0;
  let staffClaims = 0;
  const lines = normalizeDigits(stripInvisible(message))
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .split('\n')
    .filter((line) => {
      const forged = FORGED_MARKER_LINE.test(line.normalize('NFKC'));
      if (forged) forgedMarkers++;
      return !forged;
    });
  const cleaned = lines
    .map((line) => {
      if (line.startsWith(CUSTOMER_CLAIM_LABEL)) return line;
      if (!isStaffClaim(line)) return line;
      staffClaims++;
      return `${CUSTOMER_CLAIM_LABEL} ${line.trim()}`;
    })
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    cleaned,
    needsDirectContact: cleaned.length === 0,
    forgedMarkers,
    staffClaims,
  };
}

// Customer text without the lines labeled as posed staff headers, so no figure or unit is taken from them.
export function withoutStaffClaims(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith(CUSTOMER_CLAIM_LABEL))
    .join('\n');
}

// The labeled staff claims in customer text, without the label and the posed header.
export function staffClaimLines(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith(CUSTOMER_CLAIM_LABEL))
    .map((line) =>
      line
        .slice(CUSTOMER_CLAIM_LABEL.length)
        .normalize('NFKC')
        .replace(/^[\s*_~>`"'“‘«]*\[[^\]\n]*\]\s*/, '')
        .trim(),
    )
    .filter(Boolean);
}

// Admin text is data: drop lines shaped like prompt section markers, tags and headings.
export function cleanAdminText(text: string): string {
  return text
    .replace(/^[ \t]*\[[^\]\n]*\][ \t]*$/gm, '')
    .replace(/<[^>\n]*>/g, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// WhatsApp renders only *bold*, _italic_, ~strike~ and numbered lists.
export function toWhatsappFormat(text: string): string {
  return text
    .replace(
      /^#{1,6}[ \t]+(.+)$/gm,
      (_, t: string) => `*${t.replace(/\*/g, '').trim()}*`,
    )
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_')
    .replace(/~~(.+?)~~/g, '~$1~')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2');
}

export function parseResponse(raw: ChatCompletion | null): string | null {
  const content = raw?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string' || !content.trim()) return null;
  return toWhatsappFormat(content.trim());
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: string;
  args: Record<string, unknown> | null;
}

// Every call the model asked for; a missing id gets one so its tool message can still answer it.
export function parseToolCalls(raw: ChatCompletion | null): ParsedToolCall[] {
  const toolCalls = raw?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  const parsed: ParsedToolCall[] = [];
  for (const call of toolCalls) {
    const name = call?.function?.name;
    if (typeof name !== 'string' || !name) continue;
    const argText =
      typeof call.function.arguments === 'string' && call.function.arguments
        ? call.function.arguments
        : '{}';
    let args: Record<string, unknown> | null = null;
    try {
      const value: unknown = JSON.parse(argText);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        args = value as Record<string, unknown>;
      }
    } catch {
      args = null;
    }
    parsed.push({
      id:
        typeof call.id === 'string' && call.id
          ? call.id
          : `call_${randomUUID()}`,
      name,
      arguments: argText,
      args,
    });
  }
  return parsed;
}

export type JunkReason =
  | 'truncated'
  | 'empty'
  | 'formatting_only'
  | 'company_name_only'
  | 'tool_name_leak'
  | 'tool_call_text';

const bareText = (text: string): string =>
  text
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim()
    .toLowerCase();

export interface JunkCheck {
  companyName: string;
  toolNames: string[];
  toolCallText?: RegExp | null;
}

// A reply that must never reach the customer: cut off, empty, only the company name, or naming a tool.
export function junkReplyReason(
  content: string | null | undefined,
  finishReason: string | null | undefined,
  check: JunkCheck,
): JunkReason | null {
  if (finishReason === 'length') return 'truncated';
  const text = (content ?? '').trim();
  if (!text) return 'empty';
  const bare = bareText(stripCompanyNameHeader(text, check.companyName));
  if (!bare && !/\p{Extended_Pictographic}/u.test(text)) {
    return 'formatting_only';
  }
  const name = bareText(check.companyName);
  if (name && bare === name) return 'company_name_only';
  if (check.toolCallText?.test(text)) return 'tool_call_text';
  if (check.toolNames.some((tool) => text.includes(tool))) {
    return 'tool_name_leak';
  }
  return null;
}

// A bold company-name line above the answer is a header, not the reply; only the header goes.
export function stripCompanyNameHeader(
  text: string,
  companyName: string,
): string {
  const name = bareText(companyName);
  const [first, ...rest] = text.split('\n');
  const body = rest.join('\n').trim();
  if (!name || !body || !/^\s*[*_~]/.test(first)) return text;
  return bareText(first) === name ? body : text;
}

const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const URDU_LETTERS = /[ٹڈڑںھہۓےۂۃیکگپچژ]/u;

// Classifier-down fallback for fixed lines: Arabic script with Urdu letters is Urdu, other Arabic script Arabic, anything else English.
export function scriptLanguage(text: string): OptLanguage {
  if (!ARABIC_SCRIPT.test(text)) return 'en';
  return URDU_LETTERS.test(text) ? 'ur' : 'ar';
}

// Marks a line in AI history that staff sent to the customer.
export const STAFF_LINE_PREFIX =
  '[Sent to the customer by a person from the team, not by you]';

export function stripStaffLinePrefix(text: string): string {
  return text.startsWith(STAFF_LINE_PREFIX)
    ? text.slice(STAFF_LINE_PREFIX.length).trim()
    : text;
}

// Older search results keep every unit, price, size and currency line; free-text details keep only their clauses with a number.
export function compactToolResult(content: string | null): string | null {
  if (!content) return content;
  return content
    .split('\n')
    .map((line) => {
      const m = /^(\s*-?\s*Details:)\s*(.*)$/.exec(line);
      if (!m) return line;
      const facts = m[2]
        .split(/[,.;](?=\s)|\s+-\s+/)
        .map((part) => part.trim())
        .filter((part) => /\d/.test(part));
      return facts.length ? `${m[1]} ${facts.join('; ').slice(0, 160)}` : null;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}
