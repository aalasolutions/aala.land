import { REGIONS } from '@shared/constants/regions';
import { normalizeDigits } from './whatsapp-ai-filter';

const CURRENCY_ALIASES: Record<string, string> = {
  aed: 'AED',
  dirham: 'AED',
  dirhams: 'AED',
  dhs: 'AED',
  dh: 'AED',
  درهم: 'AED',
  دراهم: 'AED',
  درہم: 'AED',
  pkr: 'PKR',
  rs: 'PKR',
  rupee: 'PKR',
  rupees: 'PKR',
  rupay: 'PKR',
  rupaye: 'PKR',
  rupiya: 'PKR',
  روپے: 'PKR',
  روپیہ: 'PKR',
  روپیه: 'PKR',
  '₹': 'INR',
  usd: 'USD',
  $: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  ڈالر: 'USD',
  دولار: 'USD',
  sar: 'SAR',
  riyal: 'SAR',
  riyals: 'SAR',
  ريال: 'SAR',
};

export const FOREIGN_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
};

const KNOWN_CURRENCIES = new Set([...REGIONS.map((r) => r.currency), 'USD']);

export function parseCurrency(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase().replace(/\.$/, '');
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(CURRENCY_ALIASES, key)) {
    return CURRENCY_ALIASES[key];
  }
  const code = key.toUpperCase();
  return KNOWN_CURRENCIES.has(code) ? code : undefined;
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(kharabs?|کھرب|كھرب)$/, 100_000_000_000],
  [/^(arabs?|ارب)$/, 1_000_000_000],
  [/^(crores?|cr|کروڑ|کرور)$/, 10_000_000],
  [/^(lakhs?|lacs?|lac|لاکھ|لاكھ)$/, 100_000],
  [/^(millions?|mn|m|ملین|مليون|میلیون)$/, 1_000_000],
  [/^(thousand|hazar|hazaar|hajar|ہزار|هزار|ألف|الف|آلاف|ألاف|الاف|k)$/, 1_000],
];

const LAKH = 100_000;

const NOT_CURRENCY = new Set(['and', 'per', 'for', 'max', 'min', 'top', 'the']);

const multiplierOf = (word: string): number | undefined =>
  MULTIPLIERS.find(([re]) => re.test(word))?.[1];

const FRACTION_WORDS: [RegExp, number][] = [
  [/^(dedh|deddh|dedhh|deedh|dhed|deodh|ڈیڑھ|ڈیڑہ|ڈیڈھ|ڈیڈہ)$/, 1.5],
  [
    /^(dhai|dhaai|dhaee|adhai|adhaai|arhai|arhaai|ڈھائی|ڈھائ|اڑھائی|اڈھائی)$/,
    2.5,
  ],
];
const SAWA = /^(sawa|sawaa|swa|سوا)$/;
const PAUNE = /^(paune|pone|paunay|pauney|پونے|پونڑے)$/;
const FRACTION_STEPS: [RegExp, number][] = [
  [/^(saa?dh?e|saa?rhe|saa?dhay|saa?dhey|saddhe|ساڑھے|ساڑہے|ساڈھے|ساڈے)$/, 0.5],
  [SAWA, 0.25],
  [PAUNE, -0.25],
];

const isNumeric = (s: string | undefined) =>
  s !== undefined && /^\d+(?:\.\d+)?$/.test(s);

// "dedh crore" is 1.5 crore and "sawa lakh" 1.25 lakh; "saadhe 5", "sawa 5" and "paune 5" are 5.5, 5.25 and 4.75.
function fractionWords(tokens: string[]): string[] {
  const whole = FRACTION_WORDS.find(([re]) => re.test(tokens[0] ?? ''));
  if (whole) return [String(whole[1]), ...tokens.slice(1)];
  if (SAWA.test(tokens[0] ?? '') && multiplierOf(tokens[1] ?? '')) {
    return ['1.25', ...tokens.slice(1)];
  }
  if (PAUNE.test(tokens[0] ?? '') && multiplierOf(tokens[1] ?? '')) {
    return ['0.75', ...tokens.slice(1)];
  }
  const step = FRACTION_STEPS.find(([re]) => re.test(tokens[0] ?? ''));
  const n = Number(tokens[1]);
  if (step && isNumeric(tokens[1]) && Number.isFinite(n)) {
    return [String(n + step[1]), ...tokens.slice(2)];
  }
  return tokens;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Groups add up: "2 crore 20 lakh", "2 lakh 50 hazar"; a bare number after lakh or more counts in thousands ("1 lakh 70" is 170,000).
function groupedAmount(words: string[]): {
  amount?: number;
  unknownCurrency?: string;
} {
  let total = 0;
  let group: number | undefined;
  let lastMultiplier: number | undefined;
  let unknownCurrency: string | undefined;
  const close = () => {
    if (group !== undefined) total += group;
    group = undefined;
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const unit = multiplierOf(word);
    if (unit && group !== undefined) {
      group = round2(group * unit);
      lastMultiplier = unit;
      continue;
    }
    if (isNumeric(word) && group === undefined && i === 0) {
      group = Number(word);
      continue;
    }
    if (isNumeric(word) && lastMultiplier !== undefined) {
      const n = Number(word);
      const next = multiplierOf(words[i + 1] ?? '');
      close();
      if (next && next < lastMultiplier) {
        group = n;
        continue;
      }
      if (
        !next &&
        lastMultiplier >= LAKH &&
        n < 100 &&
        i === words.length - 1
      ) {
        total += round2((n * lastMultiplier) / 100);
        continue;
      }
      return {};
    }
    if (/^[a-z]{3}$/.test(word) && !NOT_CURRENCY.has(word)) {
      unknownCurrency = word.toUpperCase();
      continue;
    }
    return {};
  }
  close();
  return { amount: round2(total), unknownCurrency };
}

// Reads "8,000", "8k", "1.5 lakh", "2 crore", "saadhe 5 crore", "dedh lakh", "sawa lakh", "1 lakh 70", "1 arab", "50 hazar", "Rs.50,000", "AED 8000" and Arabic, Urdu or Persian digits.
export function parseAmount(value: unknown): {
  amount?: number;
  currency?: string;
  unknownCurrency?: string;
} {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { amount: value } : {};
  }
  if (typeof value !== 'string') return {};
  const text = normalizeDigits(value.normalize('NFKC'))
    .toLowerCase()
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')
    .replace(/([$€£₹])/g, ' $1 ')
    .replace(/([^\d\s.])\.?(?=\d)/gu, '$1 ')
    .replace(/(\d)(?=[^\d\s.])/gu, '$1 ')
    .trim();
  let currency: string | undefined;
  let unknownCurrency: string | undefined;
  const rest: string[] = [];
  for (const token of text.split(/\s+/)) {
    const found = parseCurrency(token);
    if (found) currency = found;
    else if (Object.prototype.hasOwnProperty.call(FOREIGN_SYMBOLS, token)) {
      unknownCurrency = FOREIGN_SYMBOLS[token];
    } else if (token) rest.push(token);
  }
  const words = fractionWords(
    rest.map((w, i) =>
      multiplierOf(rest[i + 1] ?? '') !== undefined ? numberWord(w) : w,
    ),
  );
  if (!isNumeric(words[0])) return { currency, unknownCurrency };
  const read = groupedAmount(words);
  if (read.amount === undefined) return { currency, unknownCurrency };
  return {
    amount: read.amount,
    currency,
    unknownCurrency: read.unknownCurrency ?? unknownCurrency,
  };
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  ek: 1,
  aik: 1,
  ایک: 1,
  do: 2,
  دو: 2,
  teen: 3,
  تین: 3,
  char: 4,
  chaar: 4,
  چار: 4,
  panch: 5,
  paanch: 5,
  پانچ: 5,
  chhe: 6,
  chay: 6,
  چھ: 6,
  saat: 7,
  سات: 7,
  aath: 8,
  آٹھ: 8,
  nau: 9,
  نو: 9,
  das: 10,
  دس: 10,
  bees: 20,
  بیس: 20,
  tees: 30,
  تیس: 30,
  chalees: 40,
  چالیس: 40,
  pachas: 50,
  pachaas: 50,
  پچاس: 50,
  saath: 60,
  ساٹھ: 60,
  sattar: 70,
  ستر: 70,
  assi: 80,
  اسی: 80,
  nabbe: 90,
  نوے: 90,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  گیارہ: 11,
  بارہ: 12,
  تیرہ: 13,
  چودہ: 14,
  پندرہ: 15,
  سولہ: 16,
  سترہ: 17,
  اٹھارہ: 18,
  انیس: 19,
  اکیس: 21,
  بائیس: 22,
  تئیس: 23,
  چوبیس: 24,
  پچیس: 25,
  چھبیس: 26,
  ستائیس: 27,
  اٹھائیس: 28,
  انتیس: 29,
  اکتیس: 31,
  بتیس: 32,
  تینتیس: 33,
  چونتیس: 34,
  پینتیس: 35,
  چھتیس: 36,
  سینتیس: 37,
  اڑتیس: 38,
  انتالیس: 39,
  اکتالیس: 41,
  بیالیس: 42,
  تینتالیس: 43,
  چوالیس: 44,
  پینتالیس: 45,
  چھیالیس: 46,
  سینتالیس: 47,
  اڑتالیس: 48,
  انچاس: 49,
  اکاون: 51,
  باون: 52,
  ترپن: 53,
  چون: 54,
  پچپن: 55,
  چھپن: 56,
  ستاون: 57,
  اٹھاون: 58,
  انسٹھ: 59,
  اکسٹھ: 61,
  باسٹھ: 62,
  تریسٹھ: 63,
  چونسٹھ: 64,
  پینسٹھ: 65,
  چھیاسٹھ: 66,
  سڑسٹھ: 67,
  اڑسٹھ: 68,
  انہتر: 69,
  اکہتر: 71,
  بہتر: 72,
  تہتر: 73,
  چوہتر: 74,
  پچھتر: 75,
  چھہتر: 76,
  ستتر: 77,
  اٹھہتر: 78,
  اناسی: 79,
  اکیاسی: 81,
  بیاسی: 82,
  تراسی: 83,
  چوراسی: 84,
  پچاسی: 85,
  چھیاسی: 86,
  ستاسی: 87,
  اٹھاسی: 88,
  نواسی: 89,
  اکانوے: 91,
  بانوے: 92,
  ترانوے: 93,
  چورانوے: 94,
  پچانوے: 95,
  چھیانوے: 96,
  ستانوے: 97,
  اٹھانوے: 98,
  ننانوے: 99,
  واحد: 1,
  اثنين: 2,
  اثنان: 2,
  ثلاث: 3,
  ثلاثة: 3,
  أربع: 4,
  اربع: 4,
  أربعة: 4,
  اربعة: 4,
  خمس: 5,
  خمسة: 5,
  ست: 6,
  ستة: 6,
  سبع: 7,
  سبعة: 7,
  ثمان: 8,
  ثمانية: 8,
  تسع: 9,
  تسعة: 9,
  عشر: 10,
  عشرة: 10,
  عشرين: 20,
  عشرون: 20,
  ثلاثين: 30,
  ثلاثون: 30,
  أربعين: 40,
  اربعين: 40,
  أربعون: 40,
  خمسين: 50,
  خمسون: 50,
  ستين: 60,
  ستون: 60,
  سبعين: 70,
  سبعون: 70,
  ثمانين: 80,
  ثمانون: 80,
  تسعين: 90,
  تسعون: 90,
};

// A number word counts only before a multiplier: "ek lakh", never "two" alone.
const numberWord = (word: string): string =>
  Object.prototype.hasOwnProperty.call(NUMBER_WORDS, word)
    ? String(NUMBER_WORDS[word])
    : word;

export type BudgetPeriod = 'month' | 'year';

export interface ParsedBudget {
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  unknownCurrency?: string;
  period?: BudgetPeriod;
}

const MONTH_WORDS = new Set([
  'month',
  'months',
  'monthly',
  'pm',
  'mo',
  'mahana',
  'mahina',
  'mahine',
  'maheena',
  'ماہانہ',
  'مہینہ',
  'مہینے',
  'شهري',
  'شهريا',
  'شهريًا',
  'شهرياً',
  'الشهر',
  'شهر',
  'بالشهر',
]);

const YEAR_WORDS = new Set([
  'year',
  'years',
  'yearly',
  'annual',
  'annually',
  'annum',
  'pa',
  'yr',
  'saal',
  'salana',
  'saalana',
  'سال',
  'سالانہ',
  'سنوي',
  'سنويا',
  'سنويًا',
  'سنوياً',
  'سنة',
  'السنة',
  'بالسنة',
]);

export const AT_LEAST_WORDS =
  /\b(at least|atleast|min|minimum|kam az kam)\b|کم از کم|على الأقل/iu;

const MIN_WORDS =
  /\b(above|over|more than|from|starting|zyada|ziada)\b|سے زیادہ|أكثر|اكثر|فوق/u;

// Tokens the way parseAmount reads them: Western digits, no thousands separators, numbers apart from words.
function amountTokens(text: string): string[] {
  return normalizeDigits(text.normalize('NFKC'))
    .toLowerCase()
    .replace(/(\d)[٬,](?=\d)/g, '$1')
    .replace(/٫/g, '.')
    .replace(/([$€£₹])/g, ' $1 ')
    .replace(/([^\d\s.])\.?(?=\d)/gu, '$1 ')
    .replace(/(\d)(?=[^\d\s.])/gu, '$1 ')
    .split(/[\s/،؛;:()]+/u)
    .map((t) => t.replace(/^[.!?؟]+|[.!?؟]+$/g, ''))
    .filter(Boolean);
}

const amountStart = (token: string) =>
  /^\d/.test(token) ||
  numberWord(token) !== token ||
  FRACTION_WORDS.some(([re]) => re.test(token)) ||
  FRACTION_STEPS.some(([re]) => re.test(token));

interface FoundAmount {
  amount: number;
  multiplier?: number;
  bare: boolean;
  currency: boolean;
  words: string[];
}

const FOREIGN_CODES = new Set([
  'eur',
  'gbp',
  'inr',
  'us$',
  ...Object.keys(FOREIGN_SYMBOLS),
]);

const isCurrencyToken = (token: string | undefined): boolean =>
  !!token && (!!parseCurrency(token) || FOREIGN_CODES.has(token));

// Every amount in free text, longest reading first: "budget dedh lakh to 2 lakh a month" gives 150,000 and 200,000.
function findAmounts(tokens: string[]): FoundAmount[] {
  const found: FoundAmount[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!amountStart(tokens[i])) continue;
    for (let j = Math.min(tokens.length, i + 6); j > i; j--) {
      const span = tokens.slice(i, j);
      const read = parseAmount(span.join(' '));
      if (read.amount === undefined || !Number.isFinite(read.amount)) continue;
      const multiplier = span
        .map((t) => multiplierOf(t))
        .find((m) => m !== undefined);
      found.push({
        amount: read.amount,
        multiplier,
        bare: span.length === 1 && isNumeric(span[0]),
        currency:
          span.some(isCurrencyToken) ||
          isCurrencyToken(tokens[i - 1]) ||
          isCurrencyToken(tokens[j]),
        words: span,
      });
      i = j - 1;
      break;
    }
  }
  return found;
}

// The customer's own budget wording as numbers; a range takes the larger side's multiplier ("1-2 lakh").
export function parseBudgetText(value: unknown): ParsedBudget {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { maxPrice: value } : {};
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  const tokens = amountTokens(value);
  const out: ParsedBudget = {};
  for (const token of tokens) {
    const currency = parseCurrency(token);
    if (currency) out.currency ??= currency;
    else if (Object.prototype.hasOwnProperty.call(FOREIGN_SYMBOLS, token)) {
      out.unknownCurrency ??= FOREIGN_SYMBOLS[token];
    }
    if (MONTH_WORDS.has(token)) out.period ??= 'month';
    if (YEAR_WORDS.has(token)) out.period ??= 'year';
  }
  const all = findAmounts(tokens);
  const [first, second] = all;
  if (first && second && first.bare && second.multiplier) {
    first.amount = round2(first.amount * second.multiplier);
    first.bare = false;
  }
  const kept = all.filter((a) => !a.bare || a.amount >= 100).slice(0, 2);
  if (kept.length >= 2) {
    out.minPrice = Math.min(kept[0].amount, kept[1].amount);
    out.maxPrice = Math.max(kept[0].amount, kept[1].amount);
  } else if (kept.length === 1) {
    if (MIN_WORDS.test(value.toLowerCase()) || AT_LEAST_WORDS.test(value))
      out.minPrice = kept[0].amount;
    else out.maxPrice = kept[0].amount;
  }
  return out;
}

// Amounts written with a multiplier, a currency or four or more digits, for figures written in words in a staff line.
export function amountsIn(text: string): number[] {
  return findAmounts(amountTokens(text))
    .filter((a) => a.multiplier !== undefined || a.amount >= 1000)
    .map((a) => a.amount);
}

// Money in a text: an amount next to a currency or with a multiplier ("AED 95,000", "80k", "1.5 lakh").
export function moneyAmounts(text: string): number[] {
  return findAmounts(amountTokens(text))
    .filter(
      (a) =>
        a.currency || (a.multiplier !== undefined && !a.words.includes('m')),
    )
    .map((a) => a.amount);
}
