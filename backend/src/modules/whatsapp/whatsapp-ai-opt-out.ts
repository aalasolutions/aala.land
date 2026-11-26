import { normalizeArabicLetters } from './whatsapp-ai-places';

// Fixed-line languages; every other reply language gets the English line with ENGLISH_ONLY_NOTE.
export type OptLanguage = 'en' | 'ur-Latn' | 'ur' | 'ar' | 'ar-Latn';
export type OptSignal = 'opt_out' | 'opt_in' | 'none';

export interface OptClassification {
  signal: OptSignal;
  language: OptLanguage | null;
}

// The exact words a whole message may be; the classifier decides everything else.
const STOP_WORDS: Record<OptLanguage, string[]> = {
  en: ['stop', 'unsubscribe', 'стоп'],
  'ur-Latn': ['bas karo', 'band karo'],
  ur: ['بس کرو', 'بس کریں', 'بند کرو', 'بند کریں'],
  ar: [
    'توقف',
    'أوقف',
    'ايقاف',
    'إيقاف',
    'توقف عن مراسلتي',
    'توقفوا عن مراسلتي',
    'أوقف الرسائل',
    'لا ترسل لي رسائل',
    'لا ترسلوا لي رسائل',
  ],
  'ar-Latn': [],
};

const START_WORDS: Record<OptLanguage, string[]> = {
  en: ['start', 'старт'],
  'ur-Latn': ['shuru'],
  ur: ['شروع'],
  ar: ['ابدأ', 'إبدأ'],
  'ar-Latn': [],
};

// The places letter fold, plus do-chashmi heh as heh so Urdu and Arabic spellings meet.
const foldLetters = (text: string): string =>
  normalizeArabicLetters(text).replace(/ھ/g, 'ہ');

export function normalizeOptText(text: string): string {
  return foldLetters(
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/‌/g, ' ')
      .replace(/\p{Cf}|️/gu, ''),
  )
    .replace(/['’‘`]/g, '')
    .replace(/[\p{P}\p{S}\p{Extended_Pictographic}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONFUSABLES: Readonly<Record<string, string>> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  ѕ: 's',
  і: 'i',
  ј: 'j',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  α: 'a',
  β: 'b',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  μ: 'm',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
};

const latinLookalike = (token: string): string => {
  const chars = [...token];
  if (!chars.some((c) => CONFUSABLES[c])) return token;
  return chars.every((c) => CONFUSABLES[c] || /[a-z0-9]/.test(c))
    ? chars.map((c) => CONFUSABLES[c] ?? c).join('')
    : token;
};

// "s t o p" and "S.T.O.P" read as one word; lookalike letters read as Latin.
function lineKey(line: string): string {
  const tokens = normalizeOptText(line).split(' ').filter(Boolean);
  const words = tokens.map(latinLookalike);
  return words.length >= 3 && words.every((t) => /^\p{L}$/u.test(t))
    ? words.join('')
    : words.join(' ');
}

const wordTable = (table: Record<OptLanguage, string[]>) =>
  new Map(
    (Object.entries(table) as [OptLanguage, string[]][]).flatMap(
      ([language, words]) =>
        words.map((word) => [normalizeOptText(word), language] as const),
    ),
  );

const STOP_TABLE = wordTable(STOP_WORDS);
const START_TABLE = wordTable(START_WORDS);

// Opt-out only when every line of the message is an exact stop word, opt-in only when every line is a start word.
export function classifyOptSignals(text: string): OptClassification {
  const keys = text
    .split('\n')
    .map(lineKey)
    .filter((key) => key.length > 0);
  if (keys.length === 0) return { signal: 'none', language: null };
  for (const [signal, table] of [
    ['opt_out', STOP_TABLE],
    ['opt_in', START_TABLE],
  ] as const) {
    const languages = keys.map((key) => table.get(key));
    if (languages.every((l): l is OptLanguage => l !== undefined)) {
      return {
        signal,
        language: languages.find((l) => l !== 'en') ?? 'en',
      };
    }
  }
  return { signal: 'none', language: null };
}

// A burst whose newest line is an exact stop word ends with a stop.
export function endsWithStopWord(text: string): OptClassification {
  const lines = text.split('\n').filter((line) => lineKey(line).length > 0);
  const last = lines[lines.length - 1];
  return last === undefined
    ? { signal: 'none', language: null }
    : classifyOptSignals(last).signal === 'opt_out'
      ? classifyOptSignals(last)
      : { signal: 'none', language: null };
}

export const OPT_CONFIRMATIONS: Record<
  OptLanguage,
  { optOut: string; optIn: string }
> = {
  en: {
    optOut:
      'You will not get any more automatic replies from us. A person from our team can still reply here. Send START at any time to turn automatic replies back on.',
    optIn: 'Automatic replies are on again. How can we help you?',
  },
  'ur-Latn': {
    optOut:
      'Ab aap ko hamari taraf se koi automatic jawab nahi aaye ga. Hamari team ka koi fard yahan jawab de sakta hai. Automatic jawab dobara shuru karne ke liye SHURU ya START likhein.',
    optIn:
      'Automatic jawab dobara shuru ho gaye hain. Hum aap ki kya madad kar sakte hain?',
  },
  ur: {
    optOut:
      'اب آپ کو ہماری طرف سے کوئی خودکار جواب نہیں آئے گا۔ ہماری ٹیم کا کوئی فرد یہاں جواب دے سکتا ہے۔ خودکار جواب دوبارہ شروع کرنے کے لیے “شروع” یا START لکھیں۔',
    optIn: 'خودکار جواب دوبارہ شروع ہو گئے ہیں۔ ہم آپ کی کیا مدد کر سکتے ہیں؟',
  },
  ar: {
    optOut:
      'لن تصلك أي ردود تلقائية منا بعد الآن. يمكن لأحد أفراد فريقنا الرد هنا. أرسل «ابدأ» أو START في أي وقت لإعادة تشغيل الردود التلقائية.',
    optIn: 'تم تشغيل الردود التلقائية مرة أخرى. كيف يمكننا مساعدتك؟',
  },
  'ar-Latn': {
    optOut:
      'Lan tewsalak rodood automatic minna ba3d al-aan. Momken wa7ed min fari2na yerod 3aleik hena. Ersel START fi ay wa2t 3ashan terja3 el rodood el automatic.',
    optIn: 'El rodood el automatic rej3at. Kaif momken nsa3dak?',
  },
};
