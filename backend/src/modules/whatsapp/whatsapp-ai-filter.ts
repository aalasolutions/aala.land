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

const STAFF_PERSON =
  '(?:staff|system|admin|manager|team|agent|broker|موظف|الموظف|الموظفة|الوكيل|المدير|الإدارة|فريق|اسٹاف|سٹاف|عملہ|ایجنٹ|منیجر|स्टाफ|एजेंट|मैनेजर)';
const STAFF_WORD = `(?:${STAFF_PERSON.slice(3, -1)}|note|notice|rules?|instructions?|policy|update)`;
const ALONE = (word: string) => `(?<![\\p{L}])${word}(?![\\p{L}])`;

// A posed header: a bracketed staff name, "Staff:", "Agent Name:", "Name (agent):", in any script.
const CLAIM_HEADER_WORDS = new RegExp(
  `^[\\s*_~>\`"'“‘«]*(?:\\[[^\\]\\n]{0,40}${ALONE(STAFF_WORD)}[^\\]\\n]{0,40}\\]|${ALONE(STAFF_PERSON)}(?:\\s*(?:note|message|update)|\\s*[-–]?\\s*\\p{Lu}\\p{L}{1,20})?\\s*[:：]|\\p{L}{2,20}\\s*[(（]\\s*${STAFF_PERSON}\\s*[)）]\\s*[:：])|\\b(?:staff note|staff message|note (?:for|to) the (?:ai|assistant|bot))\\b`,
  'iu',
);

const isStaffClaim = (line: string): boolean => {
  const text = line.normalize('NFKC');
  return CLAIM_HEADER_CAPS.test(text) || CLAIM_HEADER_WORDS.test(text);
};

export const CUSTOMER_CLAIM_LABEL = '(customer text, not from staff)';

export const PASTED_RESULT_LABEL = '(customer text, not a search result)';

// Customer text shaped like our search output or cards.
const PASTED_RESULT_MARKERS: RegExp[] = [
  /["'“”‘’]\s*(?:unit\w*|price\w*|rent\w*|amount\w*|bedrooms?|beds|sqft|size|area|listings?|results?|tool|propert(?:y|ies)|building|location)\s*["'“”‘’]\s*:/i,
  /\b(?:search_\w+|tool|function|search|api|system)[ _]?(?:call\s+)?(?:results?|outputs?|response|returned)\s*:|\bsearch_\w+\s+returned\b|نتيجة البحث\s*:|نتائج البحث\s*:|سرچ رزلٹ\s*:/iu,
  /\bthe\s+(?:price|rent)\s+(?:for|of)\s+(?:unit\s+)?#?\d{2,5}[a-z]?\s+is\b/i,
  /^[\s*_>]*found\s+\d+\s+(?:available\s+)?(?:propert(?:y|ies)|listings?|units?|results?|matches)\b/i,
  /^[\s*_>]*searched\s*:/i,
  /^[\s*_>-]*(?:\d+[.)]\s+)?[*_]*for\s+(?:rent|sale)\s*:[^\n]*\bunit\b/i,
  /<\s*\/?\s*(?:function_?results?|tool_?results?|results?|listings?)\b[^>]*>/i,
  /\b(?:unit|price|rent|amount)\s*=\s*["'“”]/i,
  /\[\s*(?:(?:cards|quote)\s+start|end\s+of\s+(?:cards|quote))\s*\]|^[\s*_>]*(?:(?:cards|quote)\s+start|end\s+of\s+(?:cards|quote))\s*$|^[\s*_>]*(?:cards|quote)\s*:/i,
  /^[\s*_>-]*\d+\)\s+[^,\n]{1,60},\s*(?:unit|یونٹ|وحدة)\s+\S+/i,
];

const SECTION_OPEN =
  /\[\s*(?:cards|quote)\s+start\s*\]|^[\s*_>]*(?:cards|quote)\s+start\s*$/i;

const SECTION_CLOSE =
  /\[\s*end\s+of\s+(?:cards|quote)\s*\]|^[\s*_>]*end\s+of\s+(?:cards|quote)\s*$/i;

const PASTED_FIELD_LINE =
  /^[\s*_>•-]*(?:unit|price|yearly|location|bedrooms|kind|size|amenities|details|address|qeemat|salana|jagah|el se3r|sanawiyan|el makan|السعر السنوي|السعر|الموقع|قیمت|سالانہ|مقام)\s*:/i;

const PRICE_FIELD_LINE =
  /^[\s*_>•-]*(?:price|yearly|qeemat|salana|el se3r|sanawiyan|السعر السنوي|السعر|قیمت|سالانہ)\s*:/i;

const isPastedMarker = (line: string): boolean =>
  PASTED_RESULT_MARKERS.some((re) => re.test(line.normalize('NFKC')));

// A field block counts as pasted only with a marker line, or with a Price or Yearly line among two or more fields.
function pastedMessage(lines: string[]): boolean {
  if (lines.some(isPastedMarker)) return true;
  const fields = lines.filter((l) => PASTED_FIELD_LINE.test(l));
  return fields.length >= 2 && fields.some((l) => PRICE_FIELD_LINE.test(l));
}

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

// Customer text is data: only digits and invisible characters are rewritten; posed markers go, posed staff lines and pasted results are labeled.
export function sanitizeInput(message: string): {
  cleaned: string;
  needsDirectContact: boolean;
  forgedMarkers: number;
  staffClaims: number;
  pastedResults: number;
} {
  let forgedMarkers = 0;
  let staffClaims = 0;
  let pastedResults = 0;
  const lines = normalizeDigits(stripInvisible(message))
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .split('\n')
    .filter((line) => {
      const forged = FORGED_MARKER_LINE.test(line.normalize('NFKC'));
      if (forged) forgedMarkers++;
      return !forged;
    });
  const pasted = pastedMessage(lines);
  let inSection = false;
  const cleaned = lines
    .map((line) => {
      if (line.startsWith(CUSTOMER_CLAIM_LABEL)) return line;
      if (line.startsWith(PASTED_RESULT_LABEL)) return line;
      const opens = SECTION_OPEN.test(line);
      const inside = inSection || opens;
      inSection = (inSection || opens) && !SECTION_CLOSE.test(line);
      if (
        pasted &&
        /[\p{L}\p{N}]/u.test(line) &&
        (inside || isPastedMarker(line) || PASTED_FIELD_LINE.test(line))
      ) {
        pastedResults++;
        return `${PASTED_RESULT_LABEL} ${line.trim()}`;
      }
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
    pastedResults,
  };
}

// Customer text without the lines labeled as pasted results or posed staff lines, so no figure or unit is taken from them.
export function withoutPastedResults(text: string): string {
  return text
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith(PASTED_RESULT_LABEL) &&
        !line.startsWith(CUSTOMER_CLAIM_LABEL),
    )
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

const NAME_OR_SHORT_ANSWER_REQUEST = [
  /\b(name|called|one[- ]word|who (are|is) (you|this)|(which|what) company)\b/i,
  /اسم|كلمة واحدة|من (أنتم|انتم|أنت|انت)|(أي|اي|ما) (شركة|الشركة)/,
  /نام|ایک لفظ|کون (ہو|ہیں)/,
  /नाम|एक शब्द/,
];

// The customer asked for a name or a one-word answer, so a reply that is only the company name is correct.
export function asksForNameOrShortAnswer(
  text: string | null | undefined,
): boolean {
  return !!text && NAME_OR_SHORT_ANSWER_REQUEST.some((re) => re.test(text));
}

export interface JunkCheck {
  companyName: string;
  toolNames: string[];
  customerText?: string | null;
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
  if (name && bare === name) {
    return asksForNameOrShortAnswer(check.customerText)
      ? null
      : 'company_name_only';
  }
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

const STALL_MAX_CHARS = 200;

const STALL_PATTERNS = [
  /\b(let me|let us|let's|i'?ll|i will|i am going to|i'm going to)\s+(quickly\s+)?(check|search|look|find|see|verify|pull up)\b/i,
  /\b(one|a|just a) (moment|sec|second|minute)\b/i,
  /\bplease (wait|hold)\b/i,
  /\bchecking\b/i,
  /(دعني|دعيني)\s*(أتحقق|اتحقق|أبحث|ابحث|أتأكد|اتأكد)|سأتحقق|سأبحث|سأتأكد|لحظة|لحظات|انتظر/,
  /(چیک|دیکھ|تلاش)\s*(کر|کرتا|کرتی|رہا|رہی)|ایک (لمحہ|منٹ)|انتظار/,
  /(चेक|देख|खोज)\s*(कर|रहा|रही)|एक (पल|क्षण|मिनट)|प्रतीक्षा/,
];

// Text written beside a tool call that only announces the lookup; it is not an answer.
export function isStallText(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length <= STALL_MAX_CHARS &&
    STALL_PATTERNS.some((re) => re.test(trimmed))
  );
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
