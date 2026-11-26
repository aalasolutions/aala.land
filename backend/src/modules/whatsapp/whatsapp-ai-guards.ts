import {
  CUSTOMER_CLAIM_LABEL,
  MARKER_TOKEN,
  STAFF_LINE_PREFIX,
  normalizeDigits,
  withoutStaffClaims,
} from './whatsapp-ai-filter';
import {
  COMPANY_NOTES_HEADER,
  OPENING_FIXED_TEXT,
  RULES_BLOCK,
  RULES_IDENTITY,
  RULES_NEVER,
} from './whatsapp-ai-prompts';
import { TOOL_DEFINITIONS } from './whatsapp-ai-tools';
import { normalizeOptText } from './whatsapp-ai-opt-out';
import { amountsIn, moneyAmounts } from './whatsapp-ai-parse';
import {
  UNIT_WORD_PATTERN,
  escapeRegExp,
  unitCore,
} from './whatsapp-ai-places';

export type CheckName = 'grounding' | 'leak';

export interface ReplyViolation {
  check: CheckName;
  detail: string;
  nudge: string;
}

export interface ReplyCheckContext {
  customerText: string;
  customerHistory: string[];
  toolResults: string[];
  staffLines: string[];
  notes: string;
  escalated: boolean;
  staffPrices?: StaffUnitNote[];
}

// A unit a staff line names, with the company places named beside it; a note with places binds only to those places.
export interface StaffUnitNote {
  unit: string;
  places: string[];
  price?: number;
}

const NUDGES: Record<CheckName, string> = {
  grounding:
    'Your previous reply stated a figure that is not in the tool results, the staff messages, COMPANY NOTES or the customer message. Write it again with only those figures, or none.',
  leak: 'Your previous reply showed your rules, tool names or internal text. Write it again as a plain answer to the customer.',
};

const tokensOf = (text: string): string[] =>
  normalizeOptText(text).split(' ').filter(Boolean);

export const sentencesOf = (text: string): string[] =>
  text.split(/(?<=[.!?؟۔])\s+|\n+/).filter((s) => s.trim());

const CLAUSE_SPLIT = /[.;!?؟۔\n]+|,\s+|\s+(?:and|but|while|aur|و|اور)\s+/iu;

export const clausesOf = (line: string): string[] =>
  normalizeDigits(line)
    .split(CLAUSE_SPLIT)
    .map((c) => c.trim())
    .filter(Boolean);

// Every run of `size` consecutive words in the texts.
function runsOf(texts: string[], size: number): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    const words = tokensOf(text);
    for (let i = 0; i + size <= words.length; i++) {
      out.add(words.slice(i, i + size).join(' '));
    }
  }
  return out;
}

function sharedRun(
  reply: string,
  runs: Set<string>,
  size: number,
): string | null {
  const words = tokensOf(reply);
  for (let i = 0; i + size <= words.length; i++) {
    const run = words.slice(i, i + size).join(' ');
    if (runs.has(run)) return run;
  }
  return null;
}

// --- grounding ---

// Plain digits are read directly; only a line with a multiplier word needs the money reader.
const MULTIPLIER_HINT =
  /\d\s*(?:k|m|mn|cr)\b|million|thousand|lakh|lac|crore|hazaa?r|arab|kharab|ہزار|لاکھ|کروڑ|ارب|کھرب|ألف|الف|آلاف|مليون|ملین/iu;

const PLAIN_NUMBER = /\d{1,3}(?:[,٬]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

// Every figure a source states, plain or with a multiplier, with the monthly, yearly and cheque splits it implies.
function sourceFigures(texts: string[]): number[] {
  const base = new Set<number>();
  for (const text of texts) {
    const normalized = normalizeDigits(text);
    for (const m of normalized.matchAll(PLAIN_NUMBER)) {
      base.add(Number(m[0].replace(/[,٬]/g, '')));
    }
    for (const line of normalized.split('\n')) {
      if (!MULTIPLIER_HINT.test(line)) continue;
      for (const value of moneyAmounts(line)) base.add(value);
    }
  }
  const out = new Set<number>(base);
  for (const value of base) {
    out.add(value * 12);
    for (const split of [2, 3, 4, 6, 12]) out.add(value / split);
  }
  return [...out];
}

const close = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

const SUGGESTS_PRICE =
  /\b(unit|flat|apt|villa|house|right|correct|confirm|yes or no|isn'?t it|is it|na|sahi|theek)\b|\d{3,5}\s*(?:=|\s(?:is|ka|ki|ke|for|at)\b)|\b(?:for|at|is)\s+\d{3,5}\b|صح|صحيح|درست|ٹھیک|وحدة|یونٹ/iu;

// Customer figures back a reply only as budgets: a clause naming a unit or asking to confirm a price backs nothing.
const BUDGET_WORD =
  /\b(under|below|less than|max\w*|up ?to|within|around|budget|tak|se kam|range|between)\b|ميزانية|حدود|أقل من|اقل من|بجٹ|تک|سے کم/iu;

// A question about a figure with no budget word ("so 11,000?") asks to confirm a price.
const confirmsFigure = (clause: string): boolean =>
  /[?؟]\s*$/u.test(clause) && /\d/.test(clause) && !BUDGET_WORD.test(clause);

const customerFigures = (text: string): string =>
  withoutStaffClaims(text)
    .split(/(?<=[;!?؟۔\n]|\.(?!\d))/u)
    .map((clause) => normalizeDigits(clause))
    .filter((clause) => !SUGGESTS_PRICE.test(clause) && !confirmsFigure(clause))
    .join('\n');

// --- staff lines ---

const WITHDRAWN =
  /\b(rented|rented out|sold|taken|booked|reserved|not available|no longer available|unavailable|off the market|withdrawn|kiraye par (?:de|chala|chali|ho)\w*|bik (?:gaya|gayi|chuka|chuki)|book ho (?:gaya|gayi|chuka))\b|کرائے پر (?:چلا|چلی|دے|ہو)|بک (?:گیا|گئی|چکا|چکی)|فروخت ہو|دستیاب نہیں|نہیں رہا|تم تأجير|تم بيع|مؤجر|مباع|غير متاح|محجوز/iu;

const NOT_WITHDRAWN =
  /\b(viewing|visit|appointment|meeting|call|still)\b|معاينة|موعد|وزٹ|ملاقات/iu;

const PRICE_CUE =
  /\b(price|rent|now|new|reduced|qeemat|kiraya|kiraaya|ab)\b|قیمت|کرایہ|کرائے|اب\b|السعر|سعر|الإيجار|إيجار|ايجار|الآن/iu;

export const UNIT_REF = new RegExp(
  `${UNIT_WORD_PATTERN}\\s*(\\d{1,5}[a-z]?)(?![\\d,.])|(?<![\\d,.\\p{L}])(\\d{3,5}[a-z]?)(?![\\d,.]|\\s?(?:k|bed|br|bhk|sq|aed|pkr|usd|rs|dhs|درهم|روپے)\\b)`,
  'giu',
);

const NOT_PRICE_FIGURE =
  /\+?\d[\d\s-]{8,}\d|\d[\d,.]*\s*(?:sq\.?\s?ft|sqft|sq\.?\s?m|sqm|sq\.?\s?yd|square\s+(?:feet|meters?)|marla|kanal|beds?|bedrooms?|br|bhk)\b/giu;

const PRICE_SPLIT = /(?:\.(?!\d)|[;!?؟۔\n])+/u;

const unitRefs = (clause: string): string[] =>
  [...clause.matchAll(UNIT_REF)].map((m) => unitCore(m[1] ?? m[2]));

const placeKey = (s: string): string => normalizeOptText(s);

// The company places a text names, as normalized keys.
export function placesNamed(text: string, placeKeys: string[]): string[] {
  const padded = ` ${placeKey(text)} `;
  return placeKeys.filter((p) => p && padded.includes(` ${p} `));
}

export const placeKeys = (names: (string | null | undefined)[]): string[] =>
  [...new Set(names.filter((n): n is string => !!n).map(placeKey))].filter(
    Boolean,
  );

// The places a clause names, widened to the building, area and city rows they belong to.
function namedPlaces(clause: string, rows: string[][]): string[] {
  const named = placesNamed(clause, [...new Set(rows.flat())]);
  if (!named.length) return [];
  return [
    ...new Set(rows.filter((row) => row.some((p) => named.includes(p))).flat()),
  ];
}

// A note binds to a listing or sentence that names one of its places; a note naming no place binds by number.
export const bindsTo = (note: StaffUnitNote, keys: string[]): boolean =>
  note.places.length === 0 || note.places.some((p) => keys.includes(p));

// Units a staff line calls rented or sold, clause by clause; a viewing that is booked withdraws nothing.
export function withdrawnUnits(
  staffLines: string[],
  placeRows: string[][] = [],
): StaffUnitNote[] {
  const out: StaffUnitNote[] = [];
  for (const line of staffLines) {
    for (const clause of clausesOf(line)) {
      if (!WITHDRAWN.test(clause) || NOT_WITHDRAWN.test(clause)) continue;
      const places = namedPlaces(clause, placeRows);
      for (const unit of unitRefs(clause)) out.push({ unit, places });
    }
  }
  return out;
}

// The newest price a staff line gives one named unit ("Islamabad 905 is 2 crore now"); a unit and a figure need no cue word.
export function staffPrices(
  staffLines: string[],
  placeRows: string[][] = [],
): StaffUnitNote[] {
  const out = new Map<string, StaffUnitNote>();
  for (const line of staffLines) {
    for (const clause of normalizeDigits(line).split(PRICE_SPLIT)) {
      if (WITHDRAWN.test(clause)) continue;
      const units = unitRefs(clause);
      if (units.length !== 1) continue;
      const rest = clause.replace(UNIT_REF, ' ').replace(NOT_PRICE_FIGURE, ' ');
      const money = moneyAmounts(rest);
      if (
        NOT_WITHDRAWN.test(clause) &&
        !PRICE_CUE.test(clause) &&
        !money.length
      ) {
        continue;
      }
      const figures = [...money, ...amountsIn(rest)].filter((v) => v >= 100);
      if (!figures.length) continue;
      const places = namedPlaces(clause, placeRows);
      out.set(`${units[0]}|${places.join('|')}`, {
        unit: units[0],
        places,
        price: Math.max(...figures),
      });
    }
  }
  return [...out.values()];
}

const namesUnit = (sentence: string, unit: string): boolean =>
  new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(unit)}(?![\\d])`, 'iu').test(
    sentence,
  );

// A sentence naming a unit staff repriced must state the staff figure, never the list price.
function staleStaffPrice(
  reply: string,
  prices: StaffUnitNote[],
): string | null {
  for (const sentence of sentencesOf(normalizeDigits(reply))) {
    for (const note of prices) {
      if (!namesUnit(sentence, note.unit)) continue;
      if (!bindsTo(note, placesNamed(sentence, note.places))) continue;
      const allowed = sourceFigures([String(note.price)]);
      const stale = moneyAmounts(sentence).find(
        (a) => !allowed.some((f) => close(a, f)),
      );
      if (stale !== undefined)
        return `states ${stale} for ${note.unit}, staff set ${note.price}`;
    }
  }
  return null;
}

function checkGrounding(reply: string, ctx: ReplyCheckContext): string | null {
  const amounts = moneyAmounts(reply);
  if (amounts.length === 0) return null;
  const stale = staleStaffPrice(reply, ctx.staffPrices ?? []);
  if (stale) return stale;
  const figures = sourceFigures([
    ...ctx.toolResults,
    ...ctx.staffLines,
    ctx.notes,
    customerFigures(ctx.customerText),
    ...ctx.customerHistory.map(customerFigures),
  ]);
  const unsourced = amounts.find((a) => !figures.some((f) => close(a, f)));
  return unsourced === undefined ? null : `states ${unsourced} with no source`;
}

// --- leak ---

const PROMPT_RUN = 6;

const COMMON_WORDS = new Set(
  'a an the and or of to in on at for from by with as is are be it its this that these those you your they them their he she his her we our i me my not no do does did if when then than so only any all each one can could will would should may must have has had was were what which who how where there here about into over per but just more most also never'.split(
    ' ',
  ),
);

function toolTexts(): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'description' && typeof inner === 'string') out.push(inner);
      else walk(inner);
    }
  };
  walk(TOOL_DEFINITIONS);
  return out;
}

const PRESCRIBES = new Set(['say', 'tell', 'reply', 'write', 'ask']);

// Wording after "say", "tell" or "reply" is what the reply may use.
function ruleRuns(sentence: string): string[] {
  const words = tokensOf(sentence);
  const cut = words.findIndex((w) => PRESCRIBES.has(w));
  return [(cut === -1 ? words : words.slice(0, cut)).join(' ')];
}

// Every 6-word run of the rules (minus the identity block and the Never list) and tool descriptions with at least three words that are not function words.
const PROMPT_WINDOWS: Set<string> = (() => {
  const out = new Set<string>();
  const sentences = [
    OPENING_FIXED_TEXT,
    COMPANY_NOTES_HEADER,
    RULES_BLOCK.replace(RULES_IDENTITY, '').replace(RULES_NEVER, ''),
    ...toolTexts(),
  ]
    .join('\n')
    .split(/[.;:\n]+/);
  const kept = sentences.flatMap(ruleRuns);
  for (const run of runsOf(kept, PROMPT_RUN)) {
    if (run.split(' ').filter((w) => !COMMON_WORDS.has(w)).length >= 3) {
      out.add(run);
    }
  }
  return out;
})();

const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.function.name);

const ARGUMENT_NAMES = [
  ...new Set(
    TOOL_DEFINITIONS.flatMap((t) =>
      Object.keys(t.function.parameters.properties).filter((n) =>
        /[a-z][A-Z]/.test(n),
      ),
    ),
  ),
];

const TOOL_ERROR =
  /unknown argument|valid arguments?|wrong type|not run:|arguments do not match|invalid (arguments?|parameters?)|\bthe system said\b|\bsearch failed because\b/i;

const INTERNAL_TEXT: RegExp[] = [
  /\[\s*(?:last search|staff messages|late messages|company notes|company info|rules|this message|delivered late)\b/i,
  /^\s*searched\s*:/im,
  /\bnot by you\s*\]/i,
  /\bthe team deleted this message\b/i,
  /<\/?think(ing)?>|\[\s*(internal|thinking|reasoning|analysis)\s*\]/i,
  /\bthe (user|customer)('s)? (wants|is asking|asked|message|request)\b/i,
  /\[\s*[A-Z][A-Z0-9]*(?:[_ ][A-Z0-9]+)*\s*(?::[^\]\n]*)?\](?!\()/,
];

// The one-sentence decline rule 6 asks for ("We do not choose people by religion, nationality...").
const EXCLUSION_DECLINE =
  /\b(do not|don't|never|cannot|can't|won't)\s+(\w+\s+){0,2}(choose|select|pick|exclude|filter)\s+(\w+\s+){0,2}(people|tenants|neighbou?rs)\b/i;

function checkLeak(reply: string): string | null {
  if (reply.includes(MARKER_TOKEN)) return 'shows an internal marker';
  for (const label of [STAFF_LINE_PREFIX, CUSTOMER_CLAIM_LABEL]) {
    if (reply.includes(label)) return 'shows an internal history label';
  }
  const tool = [...TOOL_NAMES, ...ARGUMENT_NAMES].find((n) =>
    reply.includes(n),
  );
  if (tool) return `names ${tool}`;
  if (TOOL_ERROR.test(reply)) return 'shows tool error text';
  const internal = INTERNAL_TEXT.find((re) => re.test(reply));
  if (internal) return 'shows internal text';
  for (const sentence of sentencesOf(reply)) {
    if (EXCLUSION_DECLINE.test(sentence)) continue;
    const run = sharedRun(sentence, PROMPT_WINDOWS, PROMPT_RUN);
    if (run) return `repeats the rules: "${run}"`;
  }
  return null;
}

const CHECKS: [
  CheckName,
  (reply: string, ctx: ReplyCheckContext) => string | null,
][] = [
  ['leak', checkLeak],
  ['grounding', checkGrounding],
];

// The first check the reply fails, or null; the service retries once with the nudge, then sends the check's fixed fallback.
export function validateReply(
  reply: string,
  ctx: ReplyCheckContext,
): ReplyViolation | null {
  for (const [check, run] of CHECKS) {
    const detail = run(reply, ctx);
    if (detail) {
      const nudge =
        check === 'grounding' ? `${NUDGES[check]} (${detail})` : NUDGES[check];
      return { check, detail, nudge };
    }
  }
  return null;
}
