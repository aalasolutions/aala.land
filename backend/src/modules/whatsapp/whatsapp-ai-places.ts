import { COUNTRY_NAMES, getRegionByCode } from '@shared/constants/regions';
import { normalizeDigits } from './whatsapp-ai-filter';

// One row per company building and listing type, as read for place matching and inventory.
export interface PlaceRow {
  assetId: string;
  assetName: string;
  localityId: string;
  localityName: string;
  cityId: string;
  cityName: string;
  regionCode: string;
  country: string;
  type: string | null;
  count: number;
}

export type PlaceLevel = 'country' | 'region' | 'city' | 'area' | 'building';

const LEVEL_RANK: Record<PlaceLevel, number> = {
  country: 4,
  region: 3,
  city: 2,
  area: 1,
  building: 0,
};

export interface PlaceMatch {
  name: string;
  level: PlaceLevel;
  within: string;
  score: number;
  country?: string;
}

export interface TermResolution {
  term: string;
  label: string;
  status: 'matched' | 'unknown';
  exact: boolean;
  matches: PlaceMatch[];
  moreMatches: number;
  inside: PlaceMatch[];
  suggestions: PlaceMatch[];
  skippedParts?: number;
  elsewhere?: PlaceMatch[];
}

export interface PlaceGroupResolution {
  assetIds: string[];
  terms: TermResolution[];
}

export type CityCount = { name: string; count: number };

const CONFIDENT = 0.5;
const SUGGEST = 0.3;
const NEAR = 0.45;
const TIE = 0.05;
const WHOLE = 0.9;
const PART = 0.9;
const SKELETON = 0.9;
const INITIALS = 0.85;
const QUALIFIED = 0.85;
const SAME_IDS = 0.9;
const MAX_MATCHES = 4;
const MAX_SUGGESTIONS = 3;
const MAX_SPLIT_DEPTH = 3;
const MAX_PARTS = 3;

export const toAsciiDigits = normalizeDigits;

export const escapeRegExp = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wordList = (text: string) => text.split(' ');

const table = (pairs: string) =>
  Object.fromEntries(wordList(pairs).map((p) => [p[0], p.slice(1)]));

// Arabic letter forms folded one way, toward the Urdu forms the transliteration reads.
const LETTER_FORMS = table(
  'يی ىی ئی ےی ۓی ېی ۍی كک ڪک هہ ةہ ۃہ ۂہ أا إا آا ٱا ؤو',
);

export const normalizeArabicLetters = (text: string): string =>
  text.replace(/[يىئےۓېۍكڪهةۃۂأإآٱؤـ]/g, (ch) => LETTER_FORMS[ch] ?? '');

const TRANSLIT = table(
  'اa بb پp تt ٹt ثs جj چch حh خkh دd ڈd ذz رr ڑr زz ژzh سs شsh صs ضd طt ظz ع غgh فf ڤv قq کk گg لl مm نn ںn وw ہh ھh یy ء',
);

const ARABIC = /\p{Script=Arabic}/u;

const STOP_WORDS = new Set(
  wordList(
    'al el the of in at near city emirate state province area district shehar sheher mein mai myn ka ki ke ky wala wali wale fy',
  ),
);

// Words that name a kind of place, not a place: alone they never match.
const GENERIC_WORDS = new Set(
  wordList(
    'town tower towers burj brj homes home house houses block phase sector avenue street road residence residences residency heights garden gardens park villa villas apartment apartments building plaza center centre mall square island bay hills hill village view court lofts suites enclave extension society colony estate estates complex community sea beach lake lakes new old north south east west main',
  ),
);

const QUALIFIERS = new Set(['phase', 'sector', 'block', 'street']);
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

const numbered = (word: string, previous: string | undefined) => {
  const roman = ROMAN.indexOf(word) + 1;
  const qualified = previous !== undefined && QUALIFIERS.has(previous);
  return roman && (qualified || word.length >= 2) ? String(roman) : word;
};

// NFKC, ASCII digits, one form per Arabic letter, no marks or punctuation, letters apart from digits.
export function normalizePlace(input: string): string {
  const base = normalizeDigits(input.normalize('NFKC'))
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return normalizeArabicLetters(base)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, '$1$2 ')
    .trim()
    .replace(/\s+/g, ' ');
}

const translitWord = (word: string) => {
  const body = word.length > 3 && word.startsWith('ال') ? word.slice(2) : word;
  return [...body]
    .map((ch, i) =>
      ch === 'ہ' && i === body.length - 1 && i > 0 ? 'a' : (TRANSLIT[ch] ?? ch),
    )
    .join('');
};

// Arabic and Urdu script spelled in Latin letters, toward the stored Latin names.
export function toLatin(input: string): string {
  return normalizePlace(input)
    .split(' ')
    .map((w) => (ARABIC.test(w) ? translitWord(w) : w))
    .join(' ');
}

const placeWords = (text: string) =>
  toLatin(text)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .map((w, i, all) => numbered(w, all[i - 1]));

// Consonant classes so "Gulbrg", "Gulberg" and "گلبرگ", or "الشارقة" and "Sharjah", compare equal.
const skeletonOf = (words: string[]) =>
  words
    .map((w) => w.replace(/([aeiou])h$/, '$1'))
    .join('')
    .replace(/sh/g, 'S')
    .replace(/ch/g, 'C')
    .replace(/ph/g, 'f')
    .replace(/[tdk]h/g, (m) => m[0])
    .replace(/gh|ck|c(?![eiy])|[gjq]/g, 'k')
    .replace(/[cxz]/g, 's')
    .replace(/p/g, 'b')
    .replace(/v/g, 'f')
    .replace(/d/g, 't')
    .replace(/[aeiouyw]/g, '')
    .replace(/(.)\1+/g, '$1');

const trigrams = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const word of text.split(' ')) {
    const padded = `  ${word} `;
    for (let i = 0; word && i + 3 <= padded.length; i++) {
      out.add(padded.slice(i, i + 3));
    }
  }
  return out;
};

const setSimilarity = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const g of small) if (large.has(g)) shared++;
  return shared / (a.size + b.size - shared);
};

// The pg_trgm similarity() of two lowercase texts.
export const trigramSimilarity = (a: string, b: string): number =>
  setSimilarity(trigrams(a), trigrams(b));

const IDENTIFIER = /^(\d+|\p{L})$/u;
const isId = (w: string) => IDENTIFIER.test(w);

interface Form {
  grams: Set<string>;
  skel?: Set<string>;
  sure: boolean;
  long: boolean;
  weight: number;
}

interface Features {
  words: string[];
  key: string;
  joined: string;
  ids: string[];
  initials: string;
  significant: boolean;
  forms: Form[];
}

// Arabic-script kind words ("برج") have no Latin twin, so they leave the outline. The outline alone
// is trusted from Arabic script or a vowelless short form ("lhr"), otherwise only beside a near spelling.
const form = (words: string[], script: boolean, weight: number): Form => {
  const skel = skeletonOf(
    script ? words.filter((w) => !GENERIC_WORDS.has(w)) : words,
  );
  return {
    grams: trigrams(words.join(' ')),
    skel: skel.length >= 2 ? trigrams(skel) : undefined,
    sure: script || !/[aeiou]/.test(words.join('')),
    long: skel.length >= 3,
    weight,
  };
};

// A candidate also matches by any run of its words, so "Marina" finds "Dubai Marina".
function features(words: string[], script: boolean, runs: boolean): Features {
  const lettered = words.filter((w) => /^\p{L}{2,}$/u.test(w));
  const forms = [form(words, script, 1)];
  for (let n = words.length - 1; runs && n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const run = words.slice(i, i + n);
      if (run.some((w) => w.length >= 3 && !GENERIC_WORDS.has(w))) {
        forms.push(form(run, script, PART));
      }
    }
  }
  return {
    words,
    key: words.join(' '),
    joined: words.join(''),
    ids: words.filter(isId),
    initials: lettered.length >= 2 ? lettered.map((w) => w[0]).join('') : '',
    significant: words.some(
      (w) => w.length >= 3 && /\p{L}/u.test(w) && !GENERIC_WORDS.has(w),
    ),
    forms,
  };
}

const containsRun = (outer: string[], inner: string[]) => {
  for (let i = 0; inner.length && i + inner.length <= outer.length; i++) {
    if (inner.every((w, j) => outer[i + j] === w)) return true;
  }
  return false;
};

// "Block J", "Sector F-7" or "F-7/3": a name made of identifiers matches only the same identifiers.
function identifierScore(q: Features, c: Features): number {
  const core = q.words.filter((w) => !GENERIC_WORDS.has(w));
  if (!core.length || !core.every(isId)) return 0;
  const qualified = q.words.some((w) => QUALIFIERS.has(w));
  const run = q.words.filter((w) => QUALIFIERS.has(w) || isId(w));
  if (qualified && containsRun(c.words, run)) return QUALIFIED;
  const mixed =
    core.length >= 2 &&
    core.some((w) => /\d/.test(w)) &&
    core.some((w) => /\p{L}/u.test(w));
  if (!mixed) return 0;
  const named = c.words.filter((w) => !GENERIC_WORDS.has(w));
  if (named.every(isId) && named.join(' ') === core.join(' ')) return SAME_IDS;
  return !qualified && containsRun(c.words, core) ? QUALIFIED : 0;
}

const initialsOf = (short: Features, full: Features) =>
  !!full.initials &&
  short.joined === full.initials &&
  short.joined.length >= 2 &&
  short.joined.length <= 4 &&
  short.words.every((w) => /^\p{L}+$/u.test(w));

// Trigram similarity of the spelling or the consonant outline; extra words or a number the name lacks stay below confident.
function scoreFeatures(q: Features, c: Features): number {
  if (!q.words.length || !c.words.length) return 0;
  if (q.key === c.key) return 1;
  if (q.joined === c.joined) return 0.98;
  if (initialsOf(q, c) || initialsOf(c, q)) return INITIALS;
  if (!q.significant) return identifierScore(q, c);
  const [query] = q.forms;
  let score = 0;
  for (const f of c.forms) {
    const spelled = setSimilarity(query.grams, f.grams);
    const outline =
      query.skel &&
      f.skel &&
      (query.sure ||
        (spelled >= SUGGEST && (query.long || q.words.length === 1)))
        ? SKELETON * setSimilarity(query.skel, f.skel)
        : 0;
    score = Math.max(score, f.weight * Math.max(spelled, outline));
  }
  const longer =
    q.words.length > c.words.length && containsRun(q.words, c.words);
  return longer || q.ids.some((id) => !c.ids.includes(id))
    ? Math.min(score, NEAR)
    : score;
}

const queryFeatures = (words: string[], script: boolean) =>
  features(words, script, false);

// 1 is the same name; at or above 0.5 is a confident match.
export function placeScore(query: string, candidate: string): number {
  return scoreFeatures(
    queryFeatures(placeWords(query), ARABIC.test(query)),
    features(placeWords(candidate), false, true),
  );
}

interface Candidate {
  name: string;
  level: PlaceLevel;
  within: string;
  country: string;
  covered: Set<string>;
  form: Features;
}

export interface PlaceIndex {
  candidates: Candidate[];
  broad: Candidate[];
}

const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

// Every name of the company's places, with the buildings it covers.
export function buildPlaceIndex(rows: PlaceRow[]): PlaceIndex {
  const byKey = new Map<string, Candidate>();
  for (const r of rows) {
    const region = getRegionByCode(r.regionCode);
    const land = countryName(r.country);
    const names: [string, string, PlaceLevel, string][] = [
      [`n:${r.country}`, land, 'country', ''],
      [`c:${r.cityId}`, r.cityName, 'city', land],
      [`l:${r.localityId}`, r.localityName, 'area', r.cityName],
      [
        `a:${r.assetId}`,
        r.assetName,
        'building',
        `${r.localityName}, ${r.cityName}`,
      ],
    ];
    if (region) names.push([`g:${region.code}`, region.name, 'region', land]);
    for (const [key, name, level, within] of names) {
      const found = byKey.get(key);
      if (found) found.covered.add(r.assetId);
      else {
        const form = features(placeWords(name), false, true);
        const covered = new Set([r.assetId]);
        byKey.set(key, {
          name,
          level,
          within,
          country: r.country,
          covered,
          form,
        });
      }
    }
  }
  const candidates = [...byKey.values()];
  return {
    candidates,
    broad: candidates.filter((c) => c.level !== 'building'),
  };
}

interface Scored {
  c: Candidate;
  score: number;
}

interface Outcome {
  status: TermResolution['status'];
  best: Scored[];
  covered: Set<string>;
  rank: number;
  top: number;
  inside: Scored[];
  suggestions: Scored[];
}

const overlaps = (a: Set<string>, b: Set<string>) => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

const narrowest = (list: Scored[]) => {
  const rank = Math.min(...list.map((s) => LEVEL_RANK[s.c.level]));
  return list.filter((s) => LEVEL_RANK[s.c.level] === rank);
};

class Resolver {
  private readonly memo = new Map<string, Scored[]>();

  constructor(private readonly index: PlaceIndex) {}

  // Broad reads skip buildings, which can never contain another place.
  private score(words: string[], script: boolean, broad = false): Scored[] {
    const key = `${broad ? 'b' : 'a'}${script ? 1 : 0}|${words.join(' ')}`;
    const hit = this.memo.get(key);
    if (hit) return hit;
    const q = queryFeatures(words, script);
    const scored = (broad ? this.index.broad : this.index.candidates)
      .map((c) => ({ c, score: scoreFeatures(q, c.form) }))
      .filter((s) => s.score >= SUGGEST)
      .sort((a, b) => b.score - a.score);
    this.memo.set(key, scored);
    return scored;
  }

  private pick(scored: Scored[], within?: Set<string>): Outcome {
    const pool = within
      ? scored.filter((s) => overlaps(s.c.covered, within))
      : scored;
    const top = pool[0]?.score ?? 0;
    const empty = { covered: new Set<string>(), inside: [], suggestions: [] };
    if (top < CONFIDENT) {
      const near = pool.filter((s) => LEVEL_RANK[s.c.level] < 3);
      return {
        ...empty,
        status: 'unknown',
        best: [],
        rank: -1,
        top: 0,
        suggestions: near,
      };
    }
    const best = pool.filter((s) => s.score >= Math.max(CONFIDENT, top - TIE));
    const { covered } = empty;
    for (const s of best) {
      for (const id of s.c.covered)
        if (!within || within.has(id)) covered.add(id);
    }
    const rank = Math.max(...best.map((s) => LEVEL_RANK[s.c.level]));
    return { ...empty, status: 'matched', best, rank, top };
  }

  // A term that names nothing whole is read as a narrower place inside a broader one at either end.
  resolve(
    words: string[],
    script: boolean,
    within?: Set<string>,
    depth = 0,
    split = true,
  ): Outcome {
    const whole = this.pick(this.score(words, script), within);
    if (
      (whole.status === 'matched' && whole.top >= WHOLE) ||
      words.length < 2 ||
      depth >= MAX_SPLIT_DEPTH ||
      !split
    ) {
      return whole;
    }
    let found: Outcome | undefined;
    for (let k = 1; k < words.length; k++) {
      const cut = words.length - k;
      for (const [run, rest] of [
        [words.slice(cut), words.slice(0, cut)],
        [words.slice(0, k), words.slice(k)],
      ]) {
        const broad = this.pick(this.score(run, script, true), within);
        if (broad.status !== 'matched' || broad.rank < LEVEL_RANK.area)
          continue;
        const inner = this.resolve(rest, script, broad.covered, depth + 1);
        if (inner.status !== 'matched' && broad.rank < LEVEL_RANK.city)
          continue;
        const [narrow, wide] =
          inner.rank <= broad.rank ? [inner, broad] : [broad, inner];
        const touching = (list: Scored[]) =>
          list.filter((s) => overlaps(s.c.covered, inner.covered));
        const outcome: Outcome =
          inner.status === 'matched'
            ? {
                ...narrow,
                best: touching(narrow.best),
                covered: inner.covered,
                top: Math.min(inner.top, broad.top),
                inside: touching([...wide.inside, ...wide.best]),
              }
            : {
                ...inner,
                inside: [...broad.inside, ...broad.best],
                suggestions: inner.suggestions.length
                  ? inner.suggestions
                  : narrowest(broad.best),
              };
        if (
          !found ||
          (outcome.status === 'matched' &&
            (found.status !== 'matched' || outcome.top > found.top))
        ) {
          found = outcome;
        }
      }
    }
    return found ?? whole;
  }
}

const SEPARATORS =
  /\s*(?:,|،|&|\+|\bor\b|\band\b|\bya\b|\baur\b| یا | اور | أو | او )\s*/i;

const toMatch = (s: Scored): PlaceMatch => ({
  name: s.c.name,
  level: s.c.level,
  within: s.c.within,
  score: Math.round(s.score * 100) / 100,
  country: s.c.country,
});

function uniqueMatches(list: Scored[], limit: number, byName = false) {
  const seen = new Set<string>();
  const out: PlaceMatch[] = [];
  for (const s of list) {
    const key = byName ? s.c.name : `${s.c.name}|${s.c.level}|${s.c.within}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toMatch(s));
    if (out.length === limit) break;
  }
  return out;
}

interface ResolvedTerm {
  resolution: TermResolution;
  covered: Set<string>;
  rank: number;
}

function toResolved(term: string, label: string, o: Outcome): ResolvedTerm {
  const spelled = toLatin(term);
  const inside = [...o.inside].sort(
    (x, y) => LEVEL_RANK[x.c.level] - LEVEL_RANK[y.c.level],
  );
  return {
    resolution: {
      term,
      label,
      status: o.status,
      exact:
        o.status === 'matched' &&
        !o.inside.length &&
        o.best.every((s) => toLatin(s.c.name) === spelled),
      matches: uniqueMatches(o.best, MAX_MATCHES),
      moreMatches: Math.max(0, o.best.length - MAX_MATCHES),
      inside: uniqueMatches(inside, MAX_MATCHES, true),
      suggestions: uniqueMatches(o.suggestions, MAX_SUGGESTIONS),
    },
    covered: o.covered,
    rank: o.covered.size ? o.rank : -1,
  };
}

// Airport and city codes read as the city name; the name still matches only the company's own places.
const CITY_CODES: Readonly<Record<string, string>> = Object.fromEntries(
  'DXB:Dubai,DWC:Dubai,AUH:Abu Dhabi,SHJ:Sharjah,AJM:Ajman,RAK:Ras Al Khaimah,KHI:Karachi,LHE:Lahore,ISB:Islamabad,RUH:Riyadh,JED:Jeddah,DOH:Doha'
    .split(',')
    .map((pair) => pair.split(':') as [string, string]),
);

const cityCodeName = (value: string) =>
  value.replace(/\b[A-Za-z]{3}\b/g, (w) => CITY_CODES[w.toUpperCase()] ?? w);

// Several places mean any of them; a broader place that overlaps a narrower one only narrows it.
export function resolvePlaceGroup(
  index: PlaceIndex,
  values: string[],
  group: string,
  within?: Set<string>,
  positions?: number[],
): PlaceGroupResolution {
  const resolver = new Resolver(index);
  const read = (text: string, label: string, split = true) => {
    const words = placeWords(text);
    const outcome = resolver.resolve(
      words,
      ARABIC.test(text),
      within,
      0,
      split,
    );
    return { outcome, resolved: toResolved(text, label, outcome) };
  };
  const resolved: ResolvedTerm[] = [];
  values.map(cityCodeName).forEach((value, i) => {
    const label = `${group} ${(positions?.[i] ?? i) + 1}`;
    const all = value
      .split(SEPARATORS)
      .map((p) => p.trim())
      .filter(Boolean);
    const parts = all.slice(0, MAX_PARTS);
    const whole = read(value, label, parts.length < 2);
    if (
      parts.length < 2 ||
      (whole.outcome.status === 'matched' && whole.outcome.top >= WHOLE)
    ) {
      resolved.push(whole.resolved);
      return;
    }
    parts.forEach((part, j) =>
      resolved.push(read(part, `${label}, part ${j + 1}`).resolved),
    );
    if (all.length > parts.length) {
      resolved[resolved.length - 1].resolution.skippedParts =
        all.length - parts.length;
    }
  });
  const live = resolved.filter((s) => s.covered.size > 0);
  const union = new Set<string>();
  for (const s of live) {
    if (live.some((o) => o.rank < s.rank && overlaps(o.covered, s.covered))) {
      continue;
    }
    let effective = s.covered;
    for (const o of live) {
      if (o.rank > s.rank && overlaps(o.covered, effective)) {
        effective = new Set([...effective].filter((x) => o.covered.has(x)));
      }
    }
    effective.forEach((x) => union.add(x));
  }
  return { assetIds: [...union], terms: resolved.map((s) => s.resolution) };
}

// True when the text names one of the company's places at the confident level.
export function confidentPlace(index: PlaceIndex, text: string): boolean {
  const words = placeWords(cityCodeName(text));
  return (
    words.length > 0 &&
    new Resolver(index).resolve(words, ARABIC.test(text)).status === 'matched'
  );
}

// Words that mark the number after them as a unit; the rest of UNIT_WORDS can also be part of a name.
export const UNIT_MARKERS = wordList(
  'unit apt apartment flat یونٹ فلیٹ شقة وحدة الوحدة',
);
export const UNIT_WORDS = [
  ...UNIT_MARKERS,
  ...wordList('no villa house office shop plot ہاؤس گھر مکان فيلا منزل بيت'),
];

const wordsPattern = (words: string[]) =>
  `(?:(?:${[...words]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})\\.?|#)`;

export const UNIT_WORD_PATTERN = wordsPattern(UNIT_WORDS);
const MARKER_PATTERN = wordsPattern(UNIT_MARKERS);
const SENT_PATTERN = wordsPattern([...UNIT_MARKERS, 'no']);

const MARKED_UNIT = new RegExp(
  `(?:^|[\\s,])${MARKER_PATTERN}\\s*#?\\s*([a-z]?-?\\d+[a-z0-9-]*)\\s*$`,
  'iu',
);
const LEADING_MARKER = new RegExp(`^${MARKER_PATTERN}\\s*`, 'iu');
const LEADING_UNIT = /^((?:\p{L}+[.-]?\s*)?#?\d+[a-z]?)[\s,]+(.*\p{L}.*)$/iu;
const TRAILING_WORDED_UNIT =
  /^(.*\p{L}.*?)[\s,]+(\p{L}+[.-]?\s*#?\d+[a-z]?)$/iu;
const TRAILING_UNIT = /^(.*\p{L}.*?)[\s,]+(#?\d+[a-z]?)$/iu;
const UNIT_SHAPE = /^(?:(\p{L}+)[\s.#:-]*)?#?\s*(\d+[a-z0-9-]*)$/iu;
const SECTOR_SHAPE = /^\p{L}\s*-?\s*\d+(?:\s*\/\s*\d+)?$/u;

// "Unit 606" is 606: a leading marker word dropped, the number kept as written.
export const stripUnitMarker = (text: string): string =>
  normalizeDigits(text).trim().replace(LEADING_MARKER, '').trim();

// "Villa 22 Sandstone Court" as a unit then a place; the caller checks that the place exists.
export function splitLeadingUnit(
  text: string,
): { unit: string; place: string } | undefined {
  const m = LEADING_UNIT.exec(normalizeDigits(text).trim());
  return m ? { unit: m[1].trim(), place: m[2].trim() } : undefined;
}

// "Bay Sail 1509" or "Sandstone Court villa 22": the worded reading first, then the bare number.
export function splitTrailingUnit(
  text: string,
): { unit: string; place: string }[] {
  const digits = normalizeDigits(text).trim();
  return [TRAILING_WORDED_UNIT, TRAILING_UNIT].flatMap((re) => {
    const m = re.exec(digits);
    return m ? [{ unit: m[2].trim(), place: m[1].trim() }] : [];
  });
}

// "Mueller Row Lofts, unit 202" holds a unit; "Marina House 5" is a name unless the unit was also sent.
export function splitUnitFromPlace(
  text: string,
  unit?: string,
): { place: string; unit?: string } {
  const digits = normalizeDigits(text).trim();
  const marked = MARKED_UNIT.exec(digits);
  if (marked) {
    return {
      place: digits.slice(0, marked.index).replace(/[\s,]+$/, ''),
      unit: marked[1],
    };
  }
  if (unit) {
    const sent = new RegExp(
      `[\\s,]+${SENT_PATTERN}?\\s*#?\\s*${escapeRegExp(stripUnitMarker(unit))}\\s*$`,
      'iu',
    ).exec(digits);
    if (sent && sent.index > 0)
      return { place: digits.slice(0, sent.index).trim(), unit };
  }
  return { place: text.trim() };
}

const alphanumeric = (s: string) =>
  normalizeDigits(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const dropLeadingZeros = (s: string) => s.replace(/^0+(?=\d)/, '');

// A stored unit number without punctuation, one leading word or leading zeros: "TH 08" is 8, "A-403" is a403.
export const storedUnitCore = (unitNumber: string): string =>
  dropLeadingZeros(alphanumeric(unitNumber).replace(/^[a-z]{2,}(?=\d)/, ''));

// The same reading of a unit the customer wrote: one word before the number is dropped in any script.
export function unitCore(text: string): string {
  const m = UNIT_SHAPE.exec(normalizeDigits(text).trim());
  if (!m) return dropLeadingZeros(alphanumeric(text));
  const word = m[1] && [...m[1]].length === 1 ? m[1] : '';
  return dropLeadingZeros(alphanumeric(`${word}${m[2]}`));
}

// "E-11", "F-7/4", "G 10": a letter and a number, the shape of a sector name.
export const sectorShaped = (text: string) =>
  SECTOR_SHAPE.test(normalizeDigits(text).trim());

// Unit cores to the buildings that hold them.
export type UnitIndex = Map<string, Set<string>>;

export function buildUnitIndex(
  rows: { assetId: string; unitNumber: string | null }[],
): UnitIndex {
  const index: UnitIndex = new Map();
  for (const r of rows) {
    const core = r.unitNumber ? storedUnitCore(r.unitNumber) : '';
    if (core) index.set(core, (index.get(core) ?? new Set()).add(r.assetId));
  }
  return index;
}

// Unknown terms suggest only places in the countries the rest of the search named.
export function limitSuggestions(
  terms: TermResolution[],
  countries: Set<string>,
): TermResolution[] {
  if (!countries.size) return terms;
  return terms.map((t) =>
    t.status === 'unknown'
      ? {
          ...t,
          suggestions: t.suggestions.filter(
            (s) => !s.country || countries.has(s.country),
          ),
        }
      : t,
  );
}

// The city a matched place lies in; none for a country or region.
export function matchCity(m: PlaceMatch): string | undefined {
  if (m.level === 'city') return m.name;
  if (m.level === 'area') return m.within;
  if (m.level === 'building') return m.within.split(', ').pop();
  return undefined;
}

// Countries a resolved search names: its matched places and the places they were found inside.
export function namedCountries(terms: TermResolution[]): Set<string> {
  const out = new Set<string>();
  for (const t of terms) {
    if (t.status === 'unknown' && !t.inside.length) continue;
    for (const m of [...t.matches, ...t.inside])
      if (m.country) out.add(m.country);
  }
  return out;
}
