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

// Patterns are written in either spelling and folded the same way as the text they read.
const folded = (re: RegExp): RegExp =>
  new RegExp(foldLetters(re.source), re.flags);

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

// Sent when a safety escalation was recorded but the model could not write the reply.
export const SAFETY_FALLBACK_REPLIES: Record<OptLanguage, string> = {
  en: 'A person from our team will contact you shortly. If you are in danger now, get to a safe place and contact local emergency services or someone you trust.',
  'ur-Latn':
    'Hamari team ka koi fard jald aap se rabta kare ga. Agar aap abhi khatre mein hain to foran kisi mehfooz jagah par jayein aur local emergency services ya kisi bharosemand shakhs se rabta karein.',
  ur: 'ہماری ٹیم کا کوئی فرد جلد آپ سے رابطہ کرے گا۔ اگر آپ ابھی خطرے میں ہیں تو فوراً کسی محفوظ جگہ پر جائیں اور مقامی ایمرجنسی سروسز یا کسی قابلِ اعتماد شخص سے رابطہ کریں۔',
  ar: 'سيتواصل معك أحد أفراد فريقنا قريبًا. إذا كنت في خطر الآن، فانتقل إلى مكان آمن واتصل فورًا بخدمات الطوارئ المحلية أو بشخص تثق به.',
  'ar-Latn':
    'Wa7ed min fari2na ra7 yetwasal ma3ak 2areeban. Iza kont fi khatar al-aan, ro7 la makan amen w etasel fawran b khadamat el tawari2 el ma7alleya aw b shakhs tethe2 feeh.',
};

// Provider-down fallback, precision over recall: explicit self-harm phrases, and fire, smoke or flood only inside the customer's own home.
const SAFETY_CONCERN_LATIN =
  /\b(suicide|suicidal|kill(ing)? myself|end(ing)? my (own )?life|took (all (of )?(my |the )?|too many )(pills|tablets)|(fire|smoke|flames|flood(ing)?) in (my|our) (flat|house|home|apartment|villa|kitchen|room|bedroom|building)|(my|our|the) (flat|house|home|apartment|villa|kitchen|room|bedroom|building) (is|s) (on fire|burning|flooding|flooded|under water|full of smoke)|khud ?kh?u(sh|s)(i|ee)|apni jaan (le|lena|lene)\b|apni zindagi khatam|(saari|sari|sab) goliy?an kha|(ghar|flat|kamr[ae]|kitchen|building|apartment) (mein|me|mai|men) (aag lag|pani bhar|dhuan hi dhuan))/;

const SAFETY_CONCERN_SCRIPT: RegExp[] = (<RegExp[]>[
  /خود ?کشي|اپني جان لے|اپني زندگي ختم|ساري گولياں کها|(گهر|فليٹ|کمرے|کچن|عمارت|بلڈنگ) ميں (آگ لگ|پاني بهر)|(عمارت|گهر|فليٹ|کمره|بلڈنگ) دهو\S* سے بهر/,
  /[اأإ]نتحر|انتحار|قتل نفسي|[اأ]نهي حياتي|(بلعت|[اأ]خذت|شربت) کل (الحبوب|حبوبي|الدواء)|حريق في (شقتي|بيتي|منزلي|غرفتي|مطبخي)|(الشقه|البيت|شقتي|بيتي|منزلي|المطبخ) (تحترق|يحترق)|الدخان يمل[اأ] (العماره|الشقه|البيت|شقتي|بيتي)|(الماء|المياه|الميه) (يغمر|تغمر) (الشقه|البيت|شقتي|بيتي)/,
]).map(folded);

// Fallback for held messages when the small model cannot be asked; matched after the opt-out normalization.
export function mentionsSafetyConcern(text: string): boolean {
  const normalized = normalizeOptText(text);
  return (
    SAFETY_CONCERN_LATIN.test(normalized) ||
    SAFETY_CONCERN_SCRIPT.some((pattern) => pattern.test(normalized))
  );
}

// Danger in Arabizi, Gulf Arabic, Hindi and plain English, matched after normalizeOptText.
const DANGER_WORDS: RegExp[] = (<RegExp[]>[
  /\b(7ari2a|7ari2|7areeq|7areeqa|7ariqa|7ari9a|7ree2a|ilha2ouni|il7a2ouni|il7a2ni|el7a2ouni|sa3douni|sa3edouni|sa3idouni|yidrebni|yedrabni|bey?ed?rabni|darabni|bi2telni|bey2telni|yi2tilni|ye2telni|ra7 ye2telni|tasarrob ghaz|ri7et ghaz)\b/,
  /\b(current (lag|laga|lagta|lagti) (raha|rahi|rha|rhi|gaya|gya|hai)|current maar (raha|rahi|rha|gaya)|bijli ka (jhatka|shock)|shock (lag|laga) (raha|rha|gaya|gya)|electric shock|sparks? (coming|from the))\b/,
  /\b(bachao|bachalo|mujhe maar (raha|rahe|rahi|dalega|dega)|jaan se maar|maar (dalega|dalegi|denge)|aag lag (gayi|gai|gyi)|aag lagi (hai|hui))\b/,
  /\b(gas leak|smell (of )?gas|(going|gonna|trying) to kill (me|us)|threaten(ed|ing)? to kill|(beating|hitting|choking) me|broke into (my|our)|breaking into (my|our)|someone is (in|inside) (my|our) (flat|house|home|apartment))\b/,
  /(في|فيه|صار|شب|شبت) حريق|حريقه|ولعت|النار (ولعت|شبت)|(الشقه|البيت|المطبخ) (يولع|تولع|تحترق|يحترق)|يضربني|بيقتلني|يبي يقتلني|بيذبحني|الحقوني|ساعدوني|فزعه|تسرب غاز|ريحه غاز/,
  /आग लग|धुआं भर|धुंआ भर|बचाओ|मुझे मार|मार रहे|मार रहा|मार रही|मार डाल|जान से मार|डर गई हूं|डर गया हूं|गैस लीक/,
]).map(folded);

// Being asked to send money to someone, or asking whether to; "I paid" alone matches nothing here.
const PAYMENT_ASK: RegExp[] = (<RegExp[]>[
  /\b(asked|asking|asks|wants|told|telling) me to (send|pay|transfer|deposit|wire)\b|\bshould i (send|pay|transfer|deposit|wire)\b|\b(his|her|their|personal|private) (bank )?account\b|\bsend \d[\d,.]*k? ?(aed|dhs|dirhams?|rs|rupees|pkr|sar|riyals?)\b|\bsend (money|cash)\b/,
  /\b(a7awel|a7wel|7awel|7awwel|7awwil|ad3a|adfa3|edfa3|ab3at|arsel) (lah|leh|laho|la|loh|flous|floos|fulus|mablagh|\d)/,
  /\b(payment|paise|paisay|raqam|advance|token) (kar dun|kar doon|de dun|de doon|bhej dun|bhej doon)\b|\b(paise|paisay|raqam|advance|token) (bhej|bhejun|bhejoon|bhej dun|bhej doon|de dun|de doon|transfer)|\baccount (mein|me|mai) (dal|daal|bhej|transfer)/,
  /(حول|احول|أحول|ادفع|أدفع|ارسل|أرسل) (له|لها|لهم)|طلب مني (احول|أحول|ادفع|أدفع|ارسل|أرسل)|حسابه الشخصي|حسابها الشخصي/,
  /पैसे भेज|पैसे ट्रांसफर|एडवांस (दे|भेज)|अकाउंट में (डाल|भेज)|पेमेंट कर दूं|पेमेंट कर दूँ/,
]).map(folded);

export function mentionsDangerWords(text: string): boolean {
  const normalized = normalizeOptText(text);
  return DANGER_WORDS.some((pattern) => pattern.test(normalized));
}

export function mentionsPaymentAsk(text: string): boolean {
  const normalized = normalizeOptText(text);
  return PAYMENT_ASK.some((pattern) => pattern.test(normalized));
}

// A what-if or in-case question about danger; a report of danger happening now has none of these.
const WHAT_IF =
  /\b(what|wat)\s+(if|would|happens|should|do\s+(i|we)\s+do\s+if)\b|\bin\s+case\b|\bsuppose\b|\bagar\b|\bkya\s+hoga\b|\blaw\s+(sar|9ar|sa7)|ماذا لو|ماذا يحدث|ماذا أفعل إذا|لو حصل|اگر/iu;

export function asksWhatIf(text: string): boolean {
  return WHAT_IF.test(text);
}

const SCOPED_STOP =
  /\b(?:stop|no more|don'?t|do not|band karo|mat)\s+(?:showing|sending|send|show|bhejo|bhejna|dikhao|dikhana)\s+(?:me\s+)?(?!(?:me\s+)?(?:any\s?more\b|messages?\b|msgs?\b|texts?\b|anything\b|ads?\b|$))\S|\b(?:listings?|flats?|apartments?|villas?|studios?|plots?|ghar|makan|properties)\s+(?:mat|na|nahi)\s+(?:bhejo|bhejein|bhejna|dikhao|dikhayein)\b|\bno (?:phone )?calls?\b|\b(?:don'?t|do not|mat) call\b|\b(?:at night|after \d{1,2}\s?(?:pm|am)?|before \d{1,2}\s?(?:pm|am)?|mornings? only|only (?:in the )?mornings?|raat (?:ko|mein))\b|لا ترسل(?:وا)? لي (?:شقق|استوديو|عقارات|فلل)|في الليل|بالليل|رات کو/iu;

// Thanks, goodbyes and asks for more continue the conversation in any script; a negated want ("I don't want messages") does not.
const CONTINUES =
  /\b(?:thanks?|thank you|thx|ty|shukriya|shukria|shukran|jazakallah|jazak ?allah|merci|gracias|danke|bye|goodbye|good ?night|khuda hafiz|allah hafiz|later|baad mein|ab zaroorat nahi|no need|not now|maybe later|show|find|looking for|need|want|cheaper|price|how much|chahiye|dikhao|batao|kitne|kitna|send me|tell me)\b|спасибо|пока|شكرا|شكرًا|مع السلامة|بعدين|أريد|اريد|ابغى|أبحث|ابحث|أرخص|ارخص|كم السعر|شکریہ|خدا حافظ|اللہ حافظ|چاہیے|دکھائیں|بتائیں|धन्यवाद|शुक्रिया|अलविदा|谢谢|再见/iu;

const NEGATED_WANT =
  /\b(?:don'?t|do not|never|no|mat)\s+(?:want|need|send me|show me|tell me)\b|\bnahi chahiye\b|\bkuch nahi chahiye\b|لا أريد|لا اريد|نہیں چاہیے/giu;

// "Unsubscribe", "never message me again", "stop everything": a full stop whatever the classifier said.
const FULL_STOP =
  /\bunsubscribe\b|\bopt (?:me )?out\b|\bnever (?:message|text|contact|send|msg) (?:me|us)\b|\b(?:don'?t|do not) (?:message|text|contact|msg) (?:me|us) (?:again|any ?more|ever)\b|\bstop (?:everything|all (?:the )?messages|messaging me|texting me|sending me (?:messages|anything))\b|\b(?:band karo|bnd karo) (?:messages?|msgs?)\b|\b(?:mujhe )?(?:kuch bhi|koi message) mat bhej(?:o|ein|na)\b|توقف(?:وا)? عن مراسلتي|لا ترسل(?:وا)? لي (?:أي )?(?:رسائل|شيء)|مجھے (?:کوئی )?میسج (?:مت|نہ) بھیج/iu;

const ASKS = /[?؟？]/;

// The classifier's stop counts only for a message with no question, thanks, goodbye, ask or scoped stop; a full stop needs no classifier.
export function stopCounts(text: string, classifierStop: boolean): boolean {
  const plain = text.normalize('NFKC');
  if (ASKS.test(plain)) return false;
  const rest = plain.replace(NEGATED_WANT, ' ');
  if (FULL_STOP.test(plain))
    return !CONTINUES.test(rest.replace(FULL_STOP, ' '));
  return classifierStop && !CONTINUES.test(rest) && !SCOPED_STOP.test(plain);
}
