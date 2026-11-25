import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { normalizeDigits, type ToolDefinition } from './whatsapp-ai-filter';
import type { Unit } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import { UnitSubType } from '../properties/entities/unit-sub-type.enum';
import { AMENITY_KEYS } from '../properties/amenity-keys';
import { COUNTRY_NAMES, getRegionByCode } from '@shared/constants/regions';
import {
  PlaceIndex,
  PlaceRow,
  TermResolution,
  UnitIndex,
  confidentPlace,
  resolvePlaceGroup,
  sectorShaped,
  splitLeadingUnit,
  splitTrailingUnit,
  splitUnitFromPlace,
  stripUnitMarker,
  trigramSimilarity,
  unitCore,
  type CityCount,
} from './whatsapp-ai-places';
import {
  FOREIGN_SYMBOLS,
  parseAmount,
  parseBudgetText,
  parseCurrency,
} from './whatsapp-ai-parse';
import type { OptLanguage } from './whatsapp-ai-opt-out';

export { parseAmount, parseCurrency };

export const SEARCH_SORTS = ['price_low', 'price_high', 'largest', 'newest'];
export const PRICE_SORTS = ['price_low', 'price_high'];
export const PAGE_SIZE = 5;
export const SIZE_UNITS = ['sqft', 'sqm', 'sqyd'];
const SQFT_PER: Record<string, number> = { sqft: 1, sqm: 10.7639, sqyd: 9 };
const SIZE_TOLERANCE = 0.1;

export interface PropertySearchFilters {
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  budgetCurrency?: string;
  unknownCurrency?: string;
  budgetPeriod?: 'month' | 'year';
  budgetSwapped?: boolean;
  budgetUnread?: boolean;
  budgetAmountMissing?: boolean;
  askedCurrency?: string;
  minSqft?: number;
  maxSqft?: number;
  sizeGiven?: { unit: string; min?: number; max?: number };
  sizeApprox?: boolean;
  landMeasure?: boolean;
  kind?: string[];
  unknownKinds?: number;
  city?: string[];
  place?: string[];
  placePositions?: number[];
  unit?: string;
  unitAlt?: string;
  amenities?: string[][];
  unknownAmenities?: number[];
  unrecorded?: string[];
  ignoredAmenities?: number;
  ignoredPlaces?: number;
  type?: 'RENT' | 'SALE';
  sort?: string;
  page?: number;
}

export interface AreaCount {
  area: string;
  city: string;
  count: number;
}

export interface CurrencyCount {
  currency: string;
  count: number;
  min?: number;
  max?: number;
}

export interface PropertySearchResult {
  units: Unit[];
  total: number;
  offset?: number;
  locations?: TermResolution[];
  areas?: AreaCount[];
  moreAreas?: number;
  currencies?: CurrencyCount[];
  otherCurrency?: CurrencyCount[];
  budgetInferred?: string;
  citiesWithListings?: CityCount[];
  unknownPlaceIn?: { city: string; areas: AreaCount[]; moreAreas: number }[];
  unitWithoutBudget?: boolean;
  unitElsewhere?: boolean;
  unfiltered?: number;
  cityNeeded?: boolean;
  cityChoice?: { label: string; options: { place: string; city: string }[] };
  applied?: PropertySearchFilters;
  routed?: string[];
}

// Kind names come from the unit kind column: OFFICE_SPACE is "office", LAND_PLOT is "land".
const KIND_SUBTYPES: Record<string, UnitSubType> = Object.fromEntries(
  Object.values(UnitSubType).map((v) => [v.toLowerCase().split('_')[0], v]),
);
const STUDIO = 'studio';
export const KIND_NAMES = [...Object.keys(KIND_SUBTYPES), STUDIO];
const HOUSE = ['villa', 'townhouse'];
const KIND_SYNONYMS: Record<string, string[]> = {
  house: HOUSE,
  home: HOUSE,
  bungalow: HOUSE,
  kothi: HOUSE,
  ghar: HOUSE,
  makan: HOUSE,
  گھر: HOUSE,
  گهر: HOUSE,
  مکان: HOUSE,
  کوٹھی: HOUSE,
  بنگلہ: HOUSE,
  flat: ['apartment'],
  فلیٹ: ['apartment'],
  shaqqa: ['apartment'],
  shaqa: ['apartment'],
  شقة: ['apartment'],
  plot: ['land'],
  shop: ['retail'],
};
const KIND_LOOKUP = new Map<string, string[]>([
  ...Object.entries(KIND_SUBTYPES).flatMap(([name, v]) => [
    [name, [name]] as [string, string[]],
    [v.toLowerCase().replace(/_/g, ' '), [name]] as [string, string[]],
  ]),
  [STUDIO, [STUDIO]],
  ...Object.entries(KIND_SYNONYMS),
]);
const MEASURE = '(?:\\d+(?:\\.\\d+)?\\s*)?(?:kanals?|marlas?|کنال|مرلہ|مرلے)';
const LAND_MEASURE = new RegExp(`^${MEASURE}\\s+`, 'u');
const MEASURE_ONLY = new RegExp(`^${MEASURE}$`, 'u');

const KIND_LABELS = new Map<string, string>(
  Object.entries(KIND_SUBTYPES).map(([name, v]) => [
    v,
    name.charAt(0).toUpperCase() + name.slice(1),
  ]),
);

export const kindSubTypes = (kinds: string[]): UnitSubType[] =>
  kinds.map((k) => KIND_SUBTYPES[k]).filter(Boolean);

const MAX_AMENITIES = 12;
const MAX_PLACES = 5;
const MAX_PAGE = 200;
const MAX_CITIES_NAMED = 10;
const MAX_LOCATION_CITIES = 12;
const MAX_LOCATION_AREAS = 8;
const MAX_NOTES_CHARS = 1500;

const SEARCH_PARAMETERS = {
  type: {
    type: 'string',
    enum: ['RENT', 'SALE'],
    description: 'Only when the customer said rent, buy or sale.',
  },
  kind: {
    type: 'array',
    items: { type: 'string', enum: KIND_NAMES },
    description:
      'Property kind the customer named, for example ["apartment"], or ["villa", "townhouse"] for a house.',
  },
  city: {
    type: 'array',
    items: { type: 'string' },
    description:
      'City, state or country, written in the language and script of the listings (Dubai, not دبي or DXB). Several means any of them.',
  },
  place: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Area, community or building, in the language of the listings when you know the name, otherwise as the customer wrote it. Several means any of them. Never an amenity or a kind.',
  },
  unit: {
    type: 'string',
    description:
      'Unit number, for example "606" or "Villa 22"; the building goes in place. A question about one unit is a lookup by unit alone.',
  },
  bedrooms: {
    type: 'integer',
    minimum: 0,
    description: 'Bedrooms asked for ("2 bed" is 2); a studio is 0.',
  },
  studio: {
    type: 'boolean',
    description: 'true for a studio.',
  },
  minBedrooms: {
    type: 'integer',
    minimum: 0,
    description: 'Only when the customer said "at least" or "or more".',
  },
  maxBedrooms: {
    type: 'integer',
    minimum: 0,
    description: 'Highest bedroom count.',
  },
  minBathrooms: {
    type: 'number',
    minimum: 0,
    description: 'Minimum bathrooms.',
  },
  budgetText: {
    type: 'string',
    description:
      'The budget in the customer\'s words, for example "dedh lakh", "under 80k a month" or "٥٠ ألف". An offer for a unit is not a budget.',
  },
  minPrice: {
    type: 'number',
    minimum: 0,
    description: 'Lowest budget as a plain number.',
  },
  maxPrice: {
    type: 'number',
    minimum: 0,
    description: 'Highest budget as a plain number.',
  },
  budgetCurrency: {
    type: 'string',
    description:
      'Currency the customer wrote with the budget; never from their nationality or language.',
  },
  budgetPeriod: {
    type: 'string',
    enum: ['month', 'year'],
    description: 'Only when the customer said per month or per year.',
  },
  minSqft: {
    type: 'number',
    minimum: 0,
    description: 'Minimum size in sizeUnit.',
  },
  maxSqft: {
    type: 'number',
    minimum: 0,
    description: 'Maximum size in sizeUnit.',
  },
  sizeUnit: {
    type: 'string',
    enum: SIZE_UNITS,
    description: 'Unit of the sizes as the customer wrote it; default sqft.',
  },
  amenities: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Amenities as the customer said them, for example ["sea view", "parking"].',
  },
  sort: {
    type: 'string',
    enum: SEARCH_SORTS,
    description: 'price_low, price_high, largest or newest (default).',
  },
  page: {
    type: 'integer',
    minimum: 0,
    description: 'Page of results, 1 first; for "show more", the next page.',
  },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description:
        "Search the company's available listings. Use it for every question about properties, prices, availability or one unit. Pass only what the customer said, and keep their earlier requirements unless they changed them. A name you do not recognize may be a misspelled place: pass it as place.",
      parameters: {
        type: 'object',
        properties: SEARCH_PARAMETERS,
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_locations',
      description:
        'The cities and areas with available listings, with counts. Only for questions such as "which areas do you have".',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['RENT', 'SALE'],
            description: 'Only listings for RENT or SALE.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_staff',
      description:
        'Hand this chat to the company team: they are notified and code tells the customer. Call it only when the customer explicitly asks for a person, agent or callback, a viewing, a booking or a hold; when an owner has given the area, type and expected price of a property to list; or for a real complaint: bad service, a failed repair, a missed viewing, a rude person, being overcharged, or wrong information from you. Never for a price opinion or haggling, a language switch, a search, small talk, an off-topic ask, a greeting, or a question about why a person is involved.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['request', 'complaint'],
            description:
              'request: a person, callback, viewing, booking or hold, or an owner listing a property; complaint: a real grievance.',
          },
        },
        required: ['reason'],
        additionalProperties: false,
      },
    },
  },
];

const ESCALATED_RESULT =
  'Done: the team is notified and code adds a line telling the customer. Never promise contact or say the team was told yourself; answer the rest of the message.';

// A currency no listing can be priced in: its code when it looks like one, otherwise "other".
const foreignCurrency = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const key = value.trim();
  if (FOREIGN_SYMBOLS[key]) return FOREIGN_SYMBOLS[key];
  return /^[a-z]{3}$/i.test(key) ? key.toUpperCase() : 'other';
};

const SIZE_SUFFIXES: [RegExp, string][] = [
  [/^(sq\.?\s*ft|sqft|square\s*f(ee|oo)t|ft2|sft)$/, 'sqft'],
  [/^(sq\.?\s*m|sqm|square\s*met(er|re)s?|m2|m²|meters?|metres?)$/, 'sqm'],
  [/^(sq\.?\s*yd|sqyd|square\s*yards?|yd2|yards?|gaz)$/, 'sqyd'],
];

// A size as a number, or as text with its own unit ("100 sqm"), which wins over sizeUnit.
const sizeValue = (
  v: unknown,
  fallbackUnit: string,
): { value: number; unit: string } | undefined => {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? { value: v, unit: fallbackUnit } : undefined;
  }
  if (typeof v !== 'string') return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(
    normalizeDigits(v).replace(/,/g, '').trim().toLowerCase(),
  );
  if (!m) return undefined;
  const suffix = m[2].trim();
  const unit = suffix
    ? SIZE_SUFFIXES.find(([re]) => re.test(suffix))?.[1]
    : fallbackUnit;
  return unit ? { value: Number(m[1]), unit } : undefined;
};

const LAND_WORDS = /kanal|marla|کنال|مرلہ|مرلے|مرلا/iu;

// The one number reader for tool arguments, so validation and parsing agree ("5k" is 5000).
const toNumber = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : parseAmount(v).amount;

const count = (v: unknown) => {
  const n = toNumber(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : undefined;
};

const plain = (v: unknown) => {
  const n = toNumber(v);
  return Number.isFinite(n) ? (n as number) : undefined;
};

const half = (v: unknown) => {
  const n = plain(v);
  return n === undefined ? undefined : Math.max(0, Math.round(n * 2) / 2);
};

const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const textList = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
    .map((x) => text(x, max))
    .filter((x): x is string => Boolean(x));

const listingType = (v: unknown): 'RENT' | 'SALE' | undefined => {
  const t = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (t === 'RENT' || t === 'RENTAL') return 'RENT';
  if (t === 'SALE' || t === 'BUY' || t === 'FOR_SALE') return 'SALE';
  return undefined;
};

const unitKey = (v: unknown) => {
  const raw = text(v, 30);
  return raw ? stripUnitMarker(raw) || undefined : undefined;
};

const SPECIAL_AMENITY_LABELS: Record<string, string> = {
  ac: 'Air conditioning',
  bbq_area: 'BBQ area',
  ev_charging: 'EV charging',
  wifi: 'Wi-Fi',
  maids_room: "Maid's room",
  walk_in_closet: 'Walk-in closet',
};

const sentenceCase = (key: string) => {
  const words = key.replace(/_/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// The one amenity table: search terms resolve against these labels and results print them.
export const AMENITY_LABELS: Record<string, string> = Object.fromEntries(
  AMENITY_KEYS.map((key) => [
    key,
    SPECIAL_AMENITY_LABELS[key] ?? sentenceCase(key),
  ]),
);

const AMENITY_ALIASES: Record<string, string[]> = {
  ac: [
    'a c',
    'air conditioner',
    'air conditioners',
    'air conditioned',
    'aircon',
    'air con',
    'central ac',
    'central a c',
    'central air',
    'central air conditioning',
  ],
  wifi: ['wi fi', 'internet', 'wireless internet'],
  elevator: ['lift'],
  gym: ['fitness', 'fitness center', 'fitness centre', 'gymnasium'],
  pet_friendly: ['pets allowed', 'pets'],
  bbq_area: ['bbq', 'barbecue', 'barbecue area', 'barbeque'],
  maids_room: ['maid room', 'maid', 'maids quarters', 'maid quarters'],
  sea_view: ['seaview', 'ocean view'],
  wheelchair_accessible: ['wheelchair access', 'disabled access'],
  power_backup: ['generator', 'backup power'],
  children_play_area: ['play area', 'kids play area', 'playground'],
  built_in_wardrobes: ['wardrobes', 'built in wardrobe'],
  maid_service: ['housekeeping'],
};

const AMENITY_FAMILIES: Record<string, string[]> = {
  parking: ['covered_parking', 'free_parking', 'paid_parking'],
  pool: ['pool', 'private_pool'],
  'swimming pool': ['pool', 'private_pool'],
};

// Terms customers filter by that no listing column holds; searching them would wrongly find nothing.
const UNRECORDED_FIELDS: [RegExp, string][] = [
  [
    /\b(?:cheques?|checks?|chqs?|instal+ments?|payment (?:terms?|plans?))\b|شيك|چیک/iu,
    'Cheque terms are',
  ],
  [/\b(?:metro|subway|tube|tram)\b|مترو|میٹرو/iu, 'Metro distance is'],
  [
    /\b(?:near|nearby|close to|walking distance|minutes? (?:to|from))\b|قريب|قریب/iu,
    'Distance to nearby places is',
  ],
];

export const unrecordedField = (value: string): string | undefined =>
  UNRECORDED_FIELDS.find(([re]) => re.test(value))?.[1];

const amenityText = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const AMENITY_LOOKUP = new Map<string, string[]>();
for (const [key, label] of Object.entries(AMENITY_LABELS)) {
  for (const form of [key, label, ...(AMENITY_ALIASES[key] ?? [])]) {
    AMENITY_LOOKUP.set(amenityText(form), [key]);
  }
}
for (const [form, keys] of Object.entries(AMENITY_FAMILIES)) {
  AMENITY_LOOKUP.set(amenityText(form), keys);
}

const AMENITY_FORMS = new Map<string, string[]>(
  Object.entries(AMENITY_LABELS).map(([key, label]) => [
    key,
    [key, label, ...(AMENITY_ALIASES[key] ?? [])].map(amenityText),
  ]),
);

const FUZZY_MIN_CHARS = 5;
const FUZZY_SIMILARITY = 0.5;

// An amenity stored on this company's units, by key, label or alias, or a near spelling with as many words.
export function storedAmenityKeys(
  value: string,
  stored: Set<string>,
): string[] | undefined {
  const exact = amenityKeys(value)?.filter((k) => stored.has(k));
  if (exact?.length) return exact;
  const t = amenityText(value);
  if (t.length < FUZZY_MIN_CHARS) return undefined;
  let best: string | undefined;
  let bestScore = FUZZY_SIMILARITY;
  const words = t.split(' ').length;
  for (const key of stored) {
    for (const form of AMENITY_FORMS.get(key) ?? []) {
      if (form.split(' ').length !== words) continue;
      const score = trigramSimilarity(t, form);
      if (score >= bestScore) [best, bestScore] = [key, score];
    }
  }
  return best ? [best] : undefined;
}

// A kind name, the column value in words ("office space"), a common synonym ("house", "flat") or their plural.
export function kindsOf(value: string): string[] | undefined {
  const text = amenityText(value);
  if (MEASURE_ONLY.test(text)) return [...HOUSE, 'land'];
  const t = text.replace(LAND_MEASURE, '');
  for (const form of [t, t.replace(/es$/, ''), t.replace(/s$/, '')]) {
    const kinds = KIND_LOOKUP.get(form);
    if (kinds) return kinds;
  }
  return undefined;
}

// The amenity keys a customer's word means, by exact key, label or alias; never by substring.
export function amenityKeys(value: string): string[] | undefined {
  const t = amenityText(value);
  const singular = [
    t.replace(/ies$/, 'y'),
    t.replace(/es$/, ''),
    t.replace(/s$/, ''),
  ];
  for (const form of [t, ...singular]) {
    const keys = AMENITY_LOOKUP.get(form);
    if (keys) return keys;
  }
  return undefined;
}

export function parseSearchArgs(
  raw: Record<string, unknown>,
): PropertySearchFilters {
  const amenityList: unknown[] = Array.isArray(raw.amenities)
    ? raw.amenities
    : typeof raw.amenities === 'string'
      ? raw.amenities.split(',')
      : [];
  const amenities: string[][] = [];
  const unknownAmenities: number[] = [];
  const unrecorded = new Set<string>();
  const amenityValues = amenityList
    .map((a) => text(a, 50))
    .filter((a): a is string => Boolean(a));
  amenityValues.slice(0, MAX_AMENITIES).forEach((a, i) => {
    const keys = amenityKeys(a);
    const field = keys ? undefined : unrecordedField(a);
    if (keys) amenities.push(keys);
    else if (field) unrecorded.add(field);
    else unknownAmenities.push(i + 1);
  });

  let unit = unitKey(raw.unit);
  const place: string[] = [];
  const places = textList(raw.place, 100);
  const cities = textList(raw.city, 100);
  for (const value of places.slice(0, MAX_PLACES)) {
    const split = splitUnitFromPlace(value, unit);
    if (split.unit && !unit) unit = split.unit;
    if (split.place) place.push(split.place);
  }

  const kindValues = textList(raw.kind, 30);
  const kinds = [...new Set(kindValues.flatMap((k) => kindsOf(k) ?? []))];
  const studio =
    raw.studio === true ||
    raw.studio === 'true' ||
    (kinds.includes(STUDIO) && count(raw.bedrooms) === undefined);
  let minBedrooms = count(raw.minBedrooms);
  let maxBedrooms = count(raw.maxBedrooms);
  const exact = studio ? 0 : count(raw.bedrooms);
  if (exact !== undefined) {
    minBedrooms = Math.min(exact, minBedrooms ?? exact);
    maxBedrooms = Math.max(exact, maxBedrooms ?? exact);
  } else if (minBedrooms === 0) {
    minBedrooms = undefined;
  }

  const min = parseAmount(raw.minPrice);
  const max = parseAmount(raw.maxPrice);
  const budget = parseBudgetText(raw.budgetText);
  const given = (v: unknown) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '');
  const fromText =
    budget.minPrice !== undefined || budget.maxPrice !== undefined;
  let minPrice = fromText ? budget.minPrice : min.amount;
  let maxPrice = fromText ? budget.maxPrice : max.amount;
  const budgetSwapped =
    minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice;
  if (budgetSwapped) [minPrice, maxPrice] = [maxPrice, minPrice];
  const budgetCurrency = fromText
    ? (budget.currency ?? parseCurrency(raw.budgetCurrency))
    : (parseCurrency(raw.budgetCurrency) ??
      max.currency ??
      min.currency ??
      budget.currency);

  const offset = count(raw.offset);
  const page =
    count(raw.page) ??
    (offset !== undefined ? Math.floor(offset / PAGE_SIZE) + 1 : undefined);

  const lower = (v: unknown) =>
    typeof v === 'string' ? v.trim().toLowerCase() : '';
  const period = budget.period ?? lower(raw.budgetPeriod);
  const sort = lower(raw.sort);
  const unitName = SIZE_UNITS.includes(lower(raw.sizeUnit))
    ? lower(raw.sizeUnit)
    : 'sqft';
  const minSize = sizeValue(raw.minSqft, unitName);
  const maxSize = sizeValue(raw.maxSqft, unitName);
  const sqft = (size?: { value: number; unit: string }) =>
    size ? Math.round(size.value * SQFT_PER[size.unit]) : undefined;
  let minSqft = sqft(minSize);
  let maxSqft = sqft(maxSize);
  const sizeApprox =
    minSqft !== undefined && minSqft === maxSqft && minSqft > 0;
  if (sizeApprox) {
    minSqft = Math.floor(minSqft! * (1 - SIZE_TOLERANCE));
    maxSqft = Math.ceil(maxSqft! * (1 + SIZE_TOLERANCE));
  }
  const sizeUnitUsed = [minSize, maxSize].find(
    (x) => x && x.unit !== 'sqft',
  )?.unit;
  const landMeasure = [raw.kind, raw.place, raw.amenities, raw.minSqft]
    .flat()
    .some((v) => typeof v === 'string' && LAND_WORDS.test(v));
  const filters: PropertySearchFilters = {
    minBedrooms,
    maxBedrooms,
    minBathrooms: half(raw.minBathrooms),
    minPrice,
    maxPrice,
    budgetCurrency,
    unknownCurrency: budgetCurrency
      ? undefined
      : (foreignCurrency(raw.budgetCurrency) ??
        max.unknownCurrency ??
        min.unknownCurrency ??
        budget.unknownCurrency),
    budgetPeriod: period === 'year' || period === 'month' ? period : undefined,
    budgetSwapped: budgetSwapped || undefined,
    budgetUnread:
      (minPrice === undefined &&
        maxPrice === undefined &&
        (given(raw.minPrice) ||
          given(raw.maxPrice) ||
          given(raw.budgetText))) ||
      undefined,
    budgetAmountMissing:
      (!unit &&
        !given(raw.minPrice) &&
        !given(raw.maxPrice) &&
        !given(raw.budgetText) &&
        (given(raw.budgetCurrency) || given(raw.budgetPeriod))) ||
      undefined,
    askedCurrency: unit
      ? (budgetCurrency ??
        [foreignCurrency(raw.budgetCurrency)].find((c) => c !== 'other'))
      : undefined,
    minSqft,
    maxSqft,
    sizeGiven: sizeUnitUsed
      ? { unit: sizeUnitUsed, min: minSize?.value, max: maxSize?.value }
      : undefined,
    sizeApprox: sizeApprox || undefined,
    landMeasure: landMeasure || undefined,
    kind: kinds.filter((k) => k !== STUDIO),
    unknownKinds: kindValues.filter((k) => !kindsOf(k)).length || undefined,
    city: cities.slice(0, MAX_PLACES),
    place,
    unit,
    amenities,
    unknownAmenities,
    unrecorded: [...unrecorded],
    ignoredAmenities:
      Math.max(0, amenityValues.length - MAX_AMENITIES) || undefined,
    ignoredPlaces:
      Math.max(0, cities.length - MAX_PLACES) +
        Math.max(0, places.length - MAX_PLACES) || undefined,
    type: listingType(raw.type),
    sort: SEARCH_SORTS.includes(sort) ? sort : undefined,
    page: page && page > 1 ? Math.min(page, MAX_PAGE) : undefined,
  };
  if (filters.minPrice === undefined && filters.maxPrice === undefined) {
    delete filters.budgetCurrency;
    delete filters.unknownCurrency;
    delete filters.budgetPeriod;
  }
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
    ),
  ) as PropertySearchFilters;
}

const MAX_ROUTED_WORDS = 3;

type Routed = { kind: string[] } | { amenity: string[] };

const routeOf = (text: string, stored: Set<string>): Routed | undefined => {
  const kind = kindsOf(text);
  if (kind) return { kind };
  const amenity = storedAmenityKeys(text, stored);
  return amenity ? { amenity } : undefined;
};

const routedLabel = (r: Routed) =>
  'kind' in r
    ? `the property kind ${r.kind.map(capitalize).join(' or ')}`
    : `the amenity ${r.amenity.map(amenityLabel).join(' or ')}`;

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

const buildingAssets = (index: PlaceIndex, text: string) => {
  const { assetIds, terms } = resolvePlaceGroup(index, [text], 'place');
  const buildings = terms.every(
    (t) =>
      t.status === 'matched' && t.matches.every((m) => m.level === 'building'),
  );
  return buildings && assetIds.length ? assetIds : undefined;
};

const knownUnit = (units: UnitIndex | undefined, text: string) =>
  Boolean(units?.has(unitCore(text)));

const LEADING_WORD = /^(\p{L}+)[\s.#:-]*#?\s*\d/u;

// A known unit number, alone or after one word that is not itself a place ("House 17", not "Gulberg 603").
const unitValue = (
  index: PlaceIndex,
  units: UnitIndex | undefined,
  text: string,
) => {
  if (!knownUnit(units, text)) return false;
  const word = LEADING_WORD.exec(normalizeDigits(text).trim())?.[1];
  return !word || !confidentPlace(index, word);
};

const kindWorded = (unit: string) =>
  Boolean(kindsOf(unit.replace(/[\s.#:-]*\d[\p{L}\d-]*$/u, '')));

const unitInPlace = (
  index: PlaceIndex,
  units: UnitIndex | undefined,
  unit: string,
  place: string,
) => {
  const holders = units?.get(unitCore(unit));
  if (!holders) return undefined;
  const { assetIds } = resolvePlaceGroup(index, [place], 'place');
  return assetIds.some((id) => holders.has(id)) ? assetIds : undefined;
};

// "<unit> <place>", or "<place> <unit>" after a building or a place holding that unit: areas carry numbers ("DHA Phase 8").
function unitSplit(
  index: PlaceIndex,
  value: string,
  units?: UnitIndex,
  anyPlace = false,
): { place: string; unit: string; alt?: string } | undefined {
  const leading = splitLeadingUnit(value);
  if (leading && confidentPlace(index, leading.place)) return leading;
  const options = splitTrailingUnit(value).flatMap((o) => {
    if (!confidentPlace(index, o.place)) return [];
    const assets =
      buildingAssets(index, o.place) ??
      unitInPlace(index, units, o.unit, o.place) ??
      (anyPlace ? resolvePlaceGroup(index, [o.place], 'place').assetIds : []);
    return assets.length ? [{ ...o, assets }] : [];
  });
  if (options.length < 2) return options[0];
  const [worded, bare] = options;
  return sameSet(worded.assets, bare.assets) && kindWorded(worded.unit)
    ? { place: worded.place, unit: worded.unit, alt: bare.unit }
    : { place: bare.place, unit: bare.unit, alt: worded.unit };
}

// Before place matching: a place value naming a kind, a stored amenity or a unit number is read as that.
export function routePlaces(
  filters: PropertySearchFilters,
  stored: Set<string>,
  index: PlaceIndex,
  units?: UnitIndex,
): { filters: PropertySearchFilters; notes: string[] } {
  if (!filters.place?.length && !(units && filters.unit)) {
    return { filters, notes: [] };
  }
  const values = [...(filters.place ?? [])];
  const place: string[] = [];
  const placePositions: number[] = [];
  const kinds = new Set(filters.kind ?? []);
  const amenities = [...(filters.amenities ?? [])];
  let unit = filters.unit;
  let unitAlt = filters.unitAlt;
  const unrecorded = new Set(filters.unrecorded ?? []);
  const notes: string[] = [];
  const take = (r: Routed) => {
    if ('kind' in r) r.kind.forEach((k) => kinds.add(k));
    else amenities.push(r.amenity);
  };
  const keepAt = (text: string, i: number) => {
    place.push(text);
    placePositions.push(i);
  };
  const extra: string[] = [];
  const split = units && unit ? unitSplit(index, unit, units, true) : undefined;
  if (split) {
    extra.push(split.place);
    unit = unitKey(split.unit);
    unitAlt = split.alt ? unitKey(split.alt) : undefined;
    notes.push(
      'The unit value also named a place, so the place was searched with the unit number.',
    );
  } else if (
    units &&
    unit &&
    !knownUnit(units, unit) &&
    (confidentPlace(index, unit) || sectorShaped(unit))
  ) {
    extra.push(unit);
    unit = undefined;
    unitAlt = undefined;
    notes.push(
      'The unit value is a place name, not the number of any listing, so it was searched as a place.',
    );
  }
  values.forEach((value, i) => {
    const label = `Place ${i + 1}`;
    const keep = (text: string) => keepAt(text, i);
    if (confidentPlace(index, value)) {
      keep(value);
      return;
    }
    if (units && unit && unitCore(value) === unitCore(unit)) {
      notes.push(
        `${label} is the unit number, so it was not searched as a place.`,
      );
      return;
    }
    const field = unrecordedField(value);
    if (field && !routeOf(value, stored)) {
      unrecorded.add(field);
      notes.push(`${label} is not a place, so it was not searched as one.`);
      return;
    }
    const whole = routeOf(value, stored);
    if (whole) {
      take(whole);
      notes.push(
        'kind' in whole
          ? `${label} was searched as ${routedLabel(whole)}, not as a place.`
          : `${label} matches no place with listings, so it was searched as ${routedLabel(whole)}. Tell the customer it was read as an amenity, not a place.`,
      );
      return;
    }
    const split = unit ? undefined : unitSplit(index, value, units);
    if (split) {
      unit = unitKey(split.unit);
      unitAlt = split.alt ? unitKey(split.alt) : undefined;
      keep(split.place);
      notes.push(`${label} was searched as a unit number in a place.`);
      return;
    }
    if (!unit && unitValue(index, units, value)) {
      unit = unitKey(value);
      notes.push(`${label} was searched as a unit number.`);
      return;
    }
    const words = value.trim().split(/\s+/);
    for (let n = Math.min(MAX_ROUTED_WORDS, words.length - 1); n >= 1; n--) {
      const cuts: [string[], string[]][] = [
        [words.slice(-n), words.slice(0, -n)],
        [words.slice(0, n), words.slice(n)],
      ];
      for (const [part, rest] of cuts) {
        const routed = routeOf(part.join(' '), stored);
        if (!routed || !confidentPlace(index, rest.join(' '))) continue;
        take(routed);
        keep(rest.join(' '));
        notes.push(
          `Part of ${label.toLowerCase()} was searched as ${routedLabel(routed)}.`,
        );
        return;
      }
    }
    keep(value);
  });
  extra.forEach((text, j) => keepAt(text, values.length + j));
  if (!notes.length) return { filters, notes };
  const routed: PropertySearchFilters = {
    ...filters,
    place,
    placePositions,
    unit,
    unitAlt,
    amenities,
    unrecorded: [...unrecorded],
  };
  if (kinds.has(STUDIO) && routed.minBedrooms === undefined) {
    routed.minBedrooms = 0;
    routed.maxBedrooms = 0;
  }
  kinds.delete(STUDIO);
  routed.kind = [...kinds];
  for (const key of [
    'place',
    'placePositions',
    'kind',
    'amenities',
    'unit',
    'unitAlt',
    'unrecorded',
  ] as const) {
    const v = routed[key];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) {
      delete routed[key];
    }
  }
  return { filters: routed, notes };
}

// Only an amenity and nothing that narrows the search: without a city it would search every city.
export function needsCity(f: PropertySearchFilters): boolean {
  return (
    Boolean(f.amenities?.length) &&
    !f.city?.length &&
    !f.place?.length &&
    !f.unit &&
    !f.kind?.length &&
    [
      f.minBedrooms,
      f.maxBedrooms,
      f.minBathrooms,
      f.minPrice,
      f.maxPrice,
      f.minSqft,
      f.maxSqft,
    ].every((v) => v === undefined)
  );
}

const SORT_LABELS: Record<string, string> = {
  price_low: 'cheapest',
  price_high: 'most expensive',
  largest: 'largest',
  newest: 'newest',
};

export const amenityLabel = (key: string) =>
  AMENITY_LABELS[key] ?? sentenceCase(key);

const number = (n: number) =>
  Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

const plural = (n: number, one: string, many: string) =>
  `${number(n)} ${Number(n) === 1 ? one : many}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const placeLabel = (m: { name: string; level: string; within: string }) =>
  `${m.name} (${m.level}${m.within ? `, ${m.within}` : ''})`;

const placeList = (list: { name: string; level: string; within: string }[]) =>
  list.map(placeLabel).join(', ');

// Notes name the term by its position in the search arguments; the customer's own words are never repeated.
function locationNotes(terms: TermResolution[]): string[] {
  return terms.flatMap((t) => {
    const note = termNote(t);
    const skipped = t.skippedParts
      ? `${capitalize(t.label.replace(/, part \d+$/, ''))} has ${plural(t.skippedParts, 'more part', 'more parts')} that ${t.skippedParts === 1 ? 'was' : 'were'} not searched.`
      : undefined;
    return [note, skipped].filter((x): x is string => Boolean(x));
  });
}

function termNote(t: TermResolution): string | undefined {
  const who = capitalize(t.label);
  const inside = t.inside.length ? ` inside ${placeList(t.inside)}` : '';
  if (t.status === 'unknown' && t.elsewhere?.length) {
    return `${who} was not found in the searched city, but ${placeList(t.elsewhere)} has listings. Ask the customer which city they mean, as a numbered list of the searched city and ${t.elsewhere.length === 1 ? 'that city' : 'those cities'}; do not pick one.`;
  }
  if (t.status === 'unknown' && t.suggestions.length) {
    return `${who} was not found${inside}. Did you mean: ${placeList(t.suggestions)}? Ask the customer, unless this chat is about another country; then say it was not found.`;
  }
  if (t.status === 'unknown') {
    return `${who} is an unknown place${inside}; ask the customer which area they mean, and do not say nothing was found there.`;
  }
  if (t.exact) return undefined;
  const more = t.moreMatches
    ? `, and ${plural(t.moreMatches, 'more place', 'more places')}`
    : '';
  return `${who} matched ${placeList(t.matches)}${more}${inside}.`;
}

function boundedNotes(notes: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const note of notes) {
    if (used + note.length > MAX_NOTES_CHARS) break;
    out.push(note);
    used += note.length;
  }
  const more = notes.length - out.length;
  return more
    ? [...out, `And ${plural(more, 'more place note', 'more place notes')}.`]
    : out;
}

const unitCurrency = (u: Unit, fallback: string) =>
  getRegionByCode(u.asset?.locality?.city?.regionCode ?? '')?.currency ??
  fallback;

const unitLocation = (u: Unit) => {
  const city = u.asset?.locality?.city;
  const region = getRegionByCode(city?.regionCode ?? '');
  return [
    u.asset?.locality?.name,
    city?.name,
    region && region.name !== city?.name ? region.name : undefined,
  ]
    .filter(Boolean)
    .join(', ');
};

const money = (currency: string, n: number) => `${currency} ${number(n)}`;

const currencyRange = (c: CurrencyCount) =>
  c.min === undefined || c.max === undefined
    ? `${c.currency} ${number(c.count)}`
    : c.min === c.max
      ? `${c.currency} ${number(c.count)} at ${money(c.currency, c.min)}`
      : `${c.currency} ${number(c.count)} from ${money(c.currency, c.min)} to ${money(c.currency, c.max)}`;

const LISTING_LABELS: Record<string, string> = {
  [PropertyType.RENTAL]: 'For Rent',
  [PropertyType.FOR_SALE]: 'For Sale',
};

// Fixed order, one field per line; the price follows the title so each figure sits next to its own unit.
function formatUnit(u: Unit, i: number, fallbackCurrency: string): string {
  const asset = u.asset;
  const rent = u.propertyType === PropertyType.RENTAL;
  const typeLabel =
    LISTING_LABELS[u.propertyType ?? ''] ?? 'Rent or sale not stated';
  const title = asset?.name
    ? `${asset.name}, unit ${u.unitNumber}`
    : `Unit ${u.unitNumber ?? ''}`.trim();
  const currency = unitCurrency(u, fallbackCurrency);
  const priced = u.price != null;
  const price = priced
    ? `${money(currency, u.price as number)}${rent ? ' per month' : ''}`
    : 'on request';
  const location = unitLocation(u);
  const size = [
    u.bedrooms === 0
      ? 'Studio'
      : u.bedrooms != null
        ? plural(u.bedrooms, 'bedroom', 'bedrooms')
        : '',
    u.bathrooms != null && Number(u.bathrooms) > 0
      ? plural(u.bathrooms, 'bathroom', 'bathrooms')
      : '',
    u.sqFt != null ? `${number(u.sqFt)} sqft` : '',
  ].filter(Boolean);
  const bedrooms =
    u.bedrooms == null
      ? 'not stated'
      : u.bedrooms === 0
        ? '0 (studio)'
        : String(u.bedrooms);
  const rows = [
    `${i}. ${typeLabel}: ${title}`,
    `   Price: ${price}`,
    rent && priced ? `   Yearly: ${money(currency, Number(u.price) * 12)}` : '',
    location ? `   Location: ${location}` : '',
    `   Bedrooms: ${bedrooms}`,
    `   Kind: ${KIND_LABELS.get(u.subType) ?? 'not stated'}`,
    asset?.address ? `   Address: ${asset.address}` : '',
    size.length ? `   Size: ${size.join(' | ')}` : '',
    u.amenities?.length
      ? `   Amenities: ${u.amenities.map(amenityLabel).join(', ')}`
      : '',
    u.description
      ? `   Details: ${u.description.replace(/\s+/g, ' ').slice(0, 200)}`
      : '',
  ];
  return rows.filter(Boolean).join('\n');
}

export interface ListingCard {
  unitId: string;
  unitNumber: string;
  building: string;
  city: string;
  text: string;
}

interface CardLabels {
  rent: string;
  sale: string;
  unstated: string;
  price: string;
  perMonth: string;
  yearly: string;
  location: string;
  bedrooms: string;
  studio: string;
  size: string;
  sqft: string;
  onRequest: string;
  unit: string;
}

const CARD_LABELS: Partial<Record<OptLanguage, CardLabels>> & {
  en: CardLabels;
} = {
  en: {
    rent: 'For rent',
    sale: 'For sale',
    unstated: 'Rent or sale not stated',
    price: 'Price',
    perMonth: 'per month',
    yearly: 'Yearly',
    location: 'Location',
    bedrooms: 'Bedrooms',
    studio: 'Studio',
    size: 'Size',
    sqft: 'sqft',
    onRequest: 'on request',
    unit: 'unit',
  },
  ar: {
    rent: 'للإيجار',
    sale: 'للبيع',
    unstated: 'الإيجار أو البيع غير محدد',
    price: 'السعر',
    perMonth: 'شهريًا',
    yearly: 'السعر السنوي',
    location: 'الموقع',
    bedrooms: 'غرف النوم',
    studio: 'استوديو',
    size: 'المساحة',
    sqft: 'قدم مربع',
    onRequest: 'عند الطلب',
    unit: 'وحدة',
  },
  ur: {
    rent: 'کرائے کے لیے',
    sale: 'برائے فروخت',
    unstated: 'کرایہ یا فروخت درج نہیں',
    price: 'قیمت',
    perMonth: 'ماہانہ',
    yearly: 'سالانہ',
    location: 'مقام',
    bedrooms: 'بیڈروم',
    studio: 'اسٹوڈیو',
    size: 'رقبہ',
    sqft: 'مربع فٹ',
    onRequest: 'درخواست پر',
    unit: 'یونٹ',
  },
  'ur-Latn': {
    rent: 'Kiraye ke liye',
    sale: 'Baraye farokht',
    unstated: 'Kiraya ya farokht darj nahi',
    price: 'Qeemat',
    perMonth: 'mahana',
    yearly: 'Salana',
    location: 'Jagah',
    bedrooms: 'Bedroom',
    studio: 'Studio',
    size: 'Size',
    sqft: 'sqft',
    onRequest: 'poochne par',
    unit: 'unit',
  },
  'ar-Latn': {
    rent: 'Lel igar',
    sale: 'Lel bee3',
    unstated: 'Igar aw bee3 mesh mazkoor',
    price: 'El se3r',
    perMonth: 'shahriyan',
    yearly: 'Sanawiyan',
    location: 'El makan',
    bedrooms: 'Ghoraf el nom',
    studio: 'Studio',
    size: 'El mesa7a',
    sqft: 'sqft',
    onRequest: '3and el talab',
    unit: 'unit',
  },
};

// The rent and sale words of the cards in every language, as the model sometimes copies them into its prose.
export const CARD_TYPE_WORDS: string[] = Object.values(CARD_LABELS).flatMap(
  (l) => (l ? [l.rent, l.sale] : []),
);

const cardLabels = (language?: OptLanguage): CardLabels =>
  (language && CARD_LABELS[language]) || CARD_LABELS.en;

// A customer-ready card from fixed templates: the same unit and language always give the same text.
export function listingCard(
  u: Unit,
  n: number,
  fallbackCurrency: string,
  language?: OptLanguage,
): ListingCard {
  const L = cardLabels(language);
  const asset = u.asset;
  const rent = u.propertyType === PropertyType.RENTAL;
  const currency = unitCurrency(u, fallbackCurrency);
  const building = asset?.name ?? '';
  const unitNumber = u.unitNumber ?? '';
  const title = building
    ? `${building}, ${L.unit} ${unitNumber}`
    : `${capitalize(L.unit)} ${unitNumber}`;
  const type =
    u.propertyType === PropertyType.RENTAL
      ? L.rent
      : u.propertyType === PropertyType.FOR_SALE
        ? L.sale
        : L.unstated;
  const priced = u.price != null;
  const price = priced
    ? `${money(currency, Number(u.price))}${rent ? ` ${L.perMonth}` : ''}`
    : L.onRequest;
  const location = unitLocation(u);
  const rows = [
    `${n}) ${title}`,
    type,
    `${L.price}: ${price}`,
    rent && priced
      ? `${L.yearly}: ${money(currency, Number(u.price) * 12)}`
      : '',
    location ? `${L.location}: ${location}` : '',
    u.bedrooms == null
      ? ''
      : `${L.bedrooms}: ${u.bedrooms === 0 ? L.studio : String(u.bedrooms)}`,
    u.sqFt != null ? `${L.size}: ${number(u.sqFt)} ${L.sqft}` : '',
  ];
  return {
    unitId: u.id,
    unitNumber,
    building,
    city: asset?.locality?.city?.name ?? '',
    text: rows.filter(Boolean).join('\n'),
  };
}

export interface Listing {
  unit: Unit;
  n: number;
}

export function searchListings(result: PropertySearchResult): Listing[] {
  const offset = result.offset ?? 0;
  return result.units.map((unit, i) => ({ unit, n: offset + i + 1 }));
}

// One card per unit, in the order the searches ran, for the service to send after the model's sentence.
export function renderCards(
  listings: Listing[],
  fallbackCurrency: string,
  language?: OptLanguage,
): ListingCard[] {
  const seen = new Set<string>();
  return listings
    .filter(({ unit }) => !seen.has(unit.id) && !!seen.add(unit.id))
    .map(({ unit, n }) => listingCard(unit, n, fallbackCurrency, language));
}

function budgetNotes(
  result: PropertySearchResult,
  filters: PropertySearchFilters,
): string[] {
  const lines: string[] = [];
  if (filters.budgetUnread) {
    lines.push(
      'A budget was given but could not be read as a number, so it was not used.',
    );
  }
  if (filters.budgetAmountMissing) {
    lines.push(
      'A budget currency or period was sent without an amount, so no budget was used. If the customer gave a budget, search again with it as budgetText.',
    );
  }
  if (filters.minPrice === undefined && filters.maxPrice === undefined) {
    return lines;
  }
  if (filters.unknownCurrency) {
    lines.push(
      filters.unknownCurrency === 'other'
        ? "The budget currency was not recognized, so the budget was compared with each listing in the listing's own currency."
        : `No listing is priced in ${filters.unknownCurrency}, so the budget was compared with each listing in the listing's own currency.`,
    );
  }
  if (result.budgetInferred) {
    lines.push(
      `The budget had no currency; it was read as ${result.budgetInferred}, the currency of every matching listing.`,
    );
  }
  if (filters.budgetSwapped) {
    lines.push(
      'The minimum budget was above the maximum, so the two were swapped.',
    );
  }
  if (filters.budgetPeriod === 'year') {
    lines.push(
      "The yearly budget was compared with each rental's yearly figure.",
    );
  } else if (!filters.budgetPeriod && filters.type !== 'SALE') {
    lines.push(
      'No budget period was given, so each rental was compared with its monthly rent or its yearly figure, whichever the budget is closer to; tell the customer which you used and that the cards show both.',
    );
  }
  const budget = filters.budgetCurrency ?? result.budgetInferred;
  for (const other of result.otherCurrency ?? []) {
    lines.push(
      `${plural(other.count, 'more listing matches', 'more listings match')} everything except the budget but ${other.count === 1 ? 'is' : 'are'} priced in ${other.currency}; the ${budget} budget was not compared with ${other.count === 1 ? 'it' : 'them'}. Prices are never converted.`,
    );
  }
  return lines;
}

const bedroomFilter = (f: PropertySearchFilters) => {
  const { minBedrooms: lo, maxBedrooms: hi } = f;
  if (lo !== undefined && lo === hi) {
    return lo === 0 ? 'studio' : `exactly ${plural(lo, 'bedroom', 'bedrooms')}`;
  }
  if (lo !== undefined && hi !== undefined) return `${lo} to ${hi} bedrooms`;
  if (lo !== undefined) return `${plural(lo, 'bedroom', 'bedrooms')} or more`;
  if (hi !== undefined) return `up to ${plural(hi, 'bedroom', 'bedrooms')}`;
  return undefined;
};

const sizeFilter = (f: PropertySearchFilters) =>
  f.minSqft !== undefined && f.maxSqft !== undefined
    ? `size ${number(f.minSqft)} to ${number(f.maxSqft)} sqft`
    : f.minSqft !== undefined
      ? `size from ${number(f.minSqft)} sqft`
      : f.maxSqft !== undefined
        ? `size up to ${number(f.maxSqft)} sqft`
        : undefined;

const SIZE_NAMES: Record<string, string> = {
  sqm: 'square meters',
  sqyd: 'square yards',
};

function sizeNotes(f: PropertySearchFilters): string[] {
  const lines: string[] = [];
  const given = f.sizeGiven;
  if (given) {
    const figures = [...new Set([given.min, given.max])]
      .filter((v): v is number => v !== undefined)
      .map(
        (v) =>
          `${number(v)} ${given.unit} is ${number(Math.round(v * SQFT_PER[given.unit]))} sqft`,
      );
    lines.push(
      `The size was given in ${SIZE_NAMES[given.unit]} and converted to sqft (1 ${given.unit} = ${number(SQFT_PER[given.unit])} sqft): ${figures.join(', ')}. Listing sizes are recorded in sqft; tell the customer the size was converted.`,
    );
  }
  if (f.sizeApprox) {
    lines.push(
      `One size was asked, so sizes within ${SIZE_TOLERANCE * 100}% of it were searched.`,
    );
  }
  return lines;
}

const LAND_NOTE =
  "Land measures: 1 kanal = 20 marla; 1 marla = 272.25 sqft by the Pakistan standard, and some listings use 225 sqft. Quote a listing's plot size from its own Details line.";

const placesSearched = (result: PropertySearchResult) => {
  const names = [
    ...new Set(
      (result.locations ?? [])
        .filter((t) => t.status === 'matched')
        .flatMap((t) => t.matches.map((m) => m.name)),
    ),
  ];
  return names.length ? `in ${names.join(' or ')}` : undefined;
};

// Only parsed values and matched place names, never customer text: the model reads it back in later turns to keep the requirements.
function filterSummary(
  f: PropertySearchFilters,
  result: PropertySearchResult,
): string {
  const currency = f.budgetCurrency ?? result.budgetInferred ?? '';
  const amount = (n: number) => `${currency} ${number(n)}`.trim();
  const period =
    f.budgetPeriod === 'year'
      ? ' per year'
      : f.budgetPeriod === 'month'
        ? ' per month'
        : f.type === 'SALE'
          ? ''
          : ', no period given';
  const budget =
    f.minPrice !== undefined && f.maxPrice !== undefined
      ? `budget ${amount(f.minPrice)} to ${amount(f.maxPrice)}${period}`
      : f.maxPrice !== undefined
        ? `budget up to ${amount(f.maxPrice)}${period}`
        : f.minPrice !== undefined
          ? `budget from ${amount(f.minPrice)}${period}`
          : undefined;
  const parts = [
    f.type === 'RENT'
      ? 'for rent only'
      : f.type === 'SALE'
        ? 'for sale only'
        : 'for rent and for sale',
    f.kind?.length ? `kind ${f.kind.map(capitalize).join(' or ')}` : undefined,
    bedroomFilter(f),
    placesSearched(result),
    budget,
    sizeFilter(f),
    f.amenities?.length
      ? `with ${f.amenities.map((keys) => keys.map(amenityLabel).join(' or ')).join(', ')}`
      : undefined,
  ].filter(Boolean);
  return `Searched: ${parts.join(', ')}.`;
}

export function formatSearchResult(
  result: PropertySearchResult,
  parsed: PropertySearchFilters,
  fallbackCurrency: string,
): string {
  const filters = result.applied ?? parsed;
  const { units, total } = result;
  const lines: string[] = [];
  const offset = result.offset ?? 0;
  if (result.cityNeeded) {
    const cities = result.citiesWithListings ?? [];
    return [
      'Not searched: the request names only an amenity, with no city.',
      filterSummary(filters, result),
      ...(result.routed ?? []),
      `If an earlier search in this chat named a city, search again with that city and the same amenity. Otherwise ask the customer which city they want${
        cities.length
          ? `; cities with listings that have it: ${cities
              .slice(0, MAX_CITIES_NAMED)
              .map((c) => `${c.name} ${number(c.count)}`)
              .join(', ')}`
          : ''
      }.`,
    ].join('\n');
  }
  if (result.cityChoice) {
    const { label, options } = result.cityChoice;
    return [
      `Not searched: ${label} is the name of places in ${plural(options.length, 'city', 'cities')}. Ask the customer which city they mean, as this numbered list, and do not pick one:`,
      ...options.map((o, i) => `${i + 1}. ${o.place}, ${o.city}`),
      ...(result.routed ?? []),
    ].join('\n');
  }
  lines.push(`Found ${plural(total, 'property', 'properties')}.`);
  lines.push(filterSummary(filters, result));
  lines.push(...(result.routed ?? []));
  lines.push(
    ...boundedNotes([...new Set(locationNotes(result.locations ?? []))]),
  );
  if (filters.ignoredPlaces) {
    lines.push(
      `Only the first ${MAX_PLACES} city and ${MAX_PLACES} place values were searched; ${plural(filters.ignoredPlaces, 'more was', 'more were')} ignored. Ask the customer to name fewer places.`,
    );
  }
  if (total > 0 && units.length === 0) {
    const last = Math.ceil(total / PAGE_SIZE);
    lines.push(
      `Page ${filters.page ?? 1} is past the end; the last page is ${last}.`,
    );
  }
  const currencies = result.currencies ?? [];
  const mixed = currencies.length > 1;
  if (mixed) {
    lines.push(
      `These listings are priced in ${currencies.length} currencies, which are never converted: ${currencies.map(currencyRange).join('; ')}.`,
    );
  }
  const grouped = mixed && PRICE_SORTS.includes(filters.sort ?? '');
  if (units.length > 0) {
    const order = SORT_LABELS[filters.sort ?? ''] ?? 'newest';
    lines.push(
      grouped
        ? `Showing items ${offset + 1} to ${offset + units.length} of ${total}, taking turns between the currencies in the order above: the ${order} in each currency first, then the next ${order} in each.`
        : `Showing items ${offset + 1} to ${offset + units.length} of ${total}, ${order} first.`,
    );
    if (offset + units.length < total) {
      const next = Math.floor(offset / PAGE_SIZE) + 2;
      lines.push(
        `For the next ones, search again with the same filters and page ${next}.`,
      );
    }
  }
  if (grouped) {
    const low = filters.sort === 'price_low';
    lines.push(
      `The ${low ? 'cheapest' : 'most expensive'} in each currency are items 1 to ${currencies.length}, one listing per currency. Prices in different currencies cannot be compared, so give the customer one per currency, not a single ${low ? 'cheapest' : 'most expensive'} overall.`,
    );
  }
  lines.push(...budgetNotes(result, filters));
  for (const field of filters.unrecorded ?? []) {
    lines.push(
      `${field} not recorded on listings, so the search was not narrowed by it; never say no listing offers it. Say staff can confirm; a listing's Details line may state it.`,
    );
  }
  if (filters.unknownAmenities?.length) {
    lines.push(
      `${filters.unknownAmenities.length === 1 ? 'Amenity' : 'Amenities'} ${filters.unknownAmenities.join(', ')} in the request ${filters.unknownAmenities.length === 1 ? 'is not one' : 'are not ones'} listings record, so ${filters.unknownAmenities.length === 1 ? 'it was' : 'they were'} not used as a filter. Listings record: ${Object.values(AMENITY_LABELS).join(', ')}.`,
    );
  }
  if (filters.unknownKinds) {
    lines.push(
      `${plural(filters.unknownKinds, 'kind value is', 'kind values are')} not a kind listings record and ${filters.unknownKinds === 1 ? 'was' : 'were'} not used. Listings record: ${KIND_NAMES.join(', ')}.`,
    );
  }
  if (filters.ignoredAmenities) {
    const first = MAX_AMENITIES + 1;
    const last = MAX_AMENITIES + filters.ignoredAmenities;
    lines.push(
      `Only the first ${MAX_AMENITIES} amenities were used; ${first === last ? `amenity ${first}` : `amenities ${first} to ${last}`} in the request ${first === last ? 'was' : 'were'} ignored, so the results may lack ${first === last ? 'it' : 'them'}.`,
    );
  }
  if ((result.areas?.length ?? 0) > 1) {
    const more = result.moreAreas
      ? `; and ${plural(result.moreAreas, 'more area', 'more areas')}`
      : '';
    lines.push(
      `By area: ${result
        .areas!.map((a) => `${a.area}, ${a.city} ${a.count}`)
        .join('; ')}${more}.`,
    );
  }
  for (const { city, areas, moreAreas } of result.unknownPlaceIn ?? []) {
    const more = moreAreas
      ? `, and ${plural(moreAreas, 'more area', 'more areas')}`
      : '';
    lines.push(
      areas.length
        ? `Unknown place in ${city}; ask the customer or list areas. Areas in ${city} with listings: ${areas.map((a) => `${a.area} ${number(a.count)}`).join(', ')}${more}.`
        : `Unknown place in ${city}; ask the customer which area they mean.`,
    );
  }
  if (result.unitWithoutBudget) {
    lines.push(
      'The unit was looked up without the budget, so its listed price is shown; an offer the customer makes is not a budget.',
    );
  }
  if (result.unitElsewhere) {
    lines.push(
      'The unit is not in the searched city or place, so it was looked up by its number alone; its own location is shown. Tell the customer where it is.',
    );
  }
  const asked =
    parsed.askedCurrency ?? (filters.unit ? parsed.budgetCurrency : undefined);
  const priced = [
    ...new Set(units.map((u) => unitCurrency(u, fallbackCurrency))),
  ];
  if (asked && priced.some((c) => c !== asked)) {
    lines.push(
      `Prices are shown in each listing's own currency (${priced.join(', ')}) and are never converted to ${asked}. Give the listed price and say it is not converted.`,
    );
  }
  lines.push(...sizeNotes(filters));
  if (
    filters.landMeasure ||
    units.some((u) => LAND_WORDS.test(u.description ?? ''))
  ) {
    lines.push(LAND_NOTE);
  }
  if (total === 0 && result.unfiltered !== undefined) {
    const emptied = [
      filters.kind?.length
        ? `kind ${filters.kind.map(capitalize).join(' or ')}`
        : undefined,
      filters.amenities?.length
        ? `with ${filters.amenities.map((keys) => keys.map(amenityLabel).join(' or ')).join(', ')}`
        : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(
      result.unfiltered > 0
        ? `Filters applied: ${emptied}. No listing matches them, but ${plural(result.unfiltered, 'listing matches', 'listings match')} the rest of the request without them. Say no listing there matches these filters and offer the others; never say there are no listings in the searched place.`
        : `Filters applied: ${emptied}. Without them nothing matches the rest of the request either.`,
    );
  }
  const cities = result.citiesWithListings ?? [];
  if (total === 0 && cities.length) {
    const more = cities.length - MAX_CITIES_NAMED;
    lines.push(
      `Cities with listings that match the rest of the request: ${cities
        .slice(0, MAX_CITIES_NAMED)
        .map((c) => `${c.name} ${number(c.count)}`)
        .join(
          ', ',
        )}${more > 0 ? `, and ${plural(more, 'more city', 'more cities')}` : ''}.`,
    );
  }
  const header = lines.join('\n');
  if (!units.length) return header;
  const body = units.map((u, i) =>
    formatUnit(u, offset + i + 1, fallbackCurrency),
  );
  return [
    header,
    ...body,
    'These listings reach the customer as cards that code sends after your reply: write one short sentence before them and never list, number or repeat them yourself. Each is named "<building>, unit <number>"; pass them as place and unit to look one up again. A number the customer sends is the listing with that number here.',
  ].join('\n\n');
}

export function formatLocations(
  rows: PlaceRow[],
  fallbackCurrency: string,
): string {
  const cities = new Map<
    string,
    {
      row: PlaceRow;
      total: number;
      rent: number;
      sale: number;
      areas: Map<string, number>;
    }
  >();
  for (const row of rows) {
    const entry = cities.get(row.cityId) ?? {
      row,
      total: 0,
      rent: 0,
      sale: 0,
      areas: new Map<string, number>(),
    };
    entry.total += row.count;
    if (row.type === PropertyType.RENTAL) entry.rent += row.count;
    if (row.type === PropertyType.FOR_SALE) entry.sale += row.count;
    entry.areas.set(
      row.localityName,
      (entry.areas.get(row.localityName) ?? 0) + row.count,
    );
    cities.set(row.cityId, entry);
  }
  const total = [...cities.values()].reduce((s, c) => s + c.total, 0);
  if (!total) return 'Found 0 available listings.';
  const sorted = [...cities.values()].sort((a, b) => b.total - a.total);
  const list = sorted
    .slice(0, MAX_LOCATION_CITIES)
    .map(({ row, total: n, rent, sale, areas }) => {
      const region = getRegionByCode(row.regionCode);
      const where = [
        region && region.name !== row.cityName ? region.name : undefined,
        COUNTRY_NAMES[row.country] ?? row.country,
      ]
        .filter(Boolean)
        .join(', ');
      const byCount = [...areas.entries()].sort((a, b) => b[1] - a[1]);
      const hidden = byCount.length - MAX_LOCATION_AREAS;
      const areaList = byCount
        .slice(0, MAX_LOCATION_AREAS)
        .map(([name, c]) => `${name} ${c}`)
        .join(', ');
      return `- ${row.cityName} (${where}), prices in ${region?.currency ?? fallbackCurrency}: ${plural(n, 'listing', 'listings')}, ${number(rent)} for rent, ${number(sale)} for sale. Areas: ${areaList}${hidden > 0 ? `, and ${plural(hidden, 'more area', 'more areas')}` : ''}.`;
    });
  const rest = sorted.slice(MAX_LOCATION_CITIES);
  if (rest.length) {
    list.push(
      `- And ${plural(rest.length, 'more city', 'more cities')} with ${plural(
        rest.reduce((s, c) => s + c.total, 0),
        'listing',
        'listings',
      )}.`,
    );
  }
  return [
    `Found ${plural(total, 'available listing', 'available listings')} in ${plural(cities.size, 'city', 'cities')}.`,
    ...list,
  ].join('\n');
}

interface ArgumentSchema {
  type?: string;
  enum?: string[];
  items?: { type?: string };
  minimum?: number;
}

const MAX_NAMED_ARGUMENTS = 5;

const SEARCH_EXAMPLE =
  '{"city":["Karachi"],"bedrooms":2,"budgetText":"80k a month"}';

// A currency with no amount searches without a budget and shows units over it; a unit lookup ignores the budget anyway.
const budgetProblem = (name: string, args: Record<string, unknown>) =>
  name === 'search_properties' &&
  !isAbsent(args.budgetCurrency) &&
  isAbsent(args.minPrice) &&
  isAbsent(args.maxPrice) &&
  isAbsent(args.budgetText) &&
  isAbsent(args.unit)
    ? 'ERROR: budget amount missing. budgetCurrency was sent without an amount; pass the budget as budgetText, for example {"budgetText":"AED 120k yearly"}, or leave budgetCurrency out when the customer gave no amount.'
    : '';

const isAbsent = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && v.length === 0);

const atLeast = (s: ArgumentSchema) =>
  s.minimum === undefined ? '' : ` of ${s.minimum} or more`;

const receivedType = (v: unknown) => {
  const n = toNumber(v);
  if (n !== undefined && !Number.isFinite(n)) return 'an out-of-range number';
  if (n !== undefined && n < 0) return 'a negative number';
  if (n !== undefined && !Number.isInteger(n)) return 'a fraction';
  return Array.isArray(v)
    ? 'an array'
    : typeof v === 'object'
      ? 'an object'
      : typeof v === 'string'
        ? 'text'
        : typeof v === 'number'
          ? 'a number'
          : typeof v === 'boolean'
            ? 'true or false'
            : typeof v;
};

const expectedType = (s: ArgumentSchema) =>
  s.enum
    ? `one of ${s.enum.join(', ')}`
    : s.type === 'array'
      ? `an array of ${s.items?.type ?? 'string'}s`
      : s.type === 'integer'
        ? `a whole number${atLeast(s)}`
        : s.type === 'number'
          ? `a number${atLeast(s)}`
          : s.type === 'boolean'
            ? 'true or false'
            : 'a string';

const enumMatch = (v: string, values: string[]) =>
  values.some((e) => e.toLowerCase() === v.trim().toLowerCase());

function fitsSchema(v: unknown, s: ArgumentSchema): boolean {
  switch (s.type) {
    case 'number':
    case 'integer': {
      const n = toNumber(v);
      return (
        n !== undefined &&
        Number.isFinite(n) &&
        (s.type === 'number' || Number.isInteger(n)) &&
        (s.minimum === undefined || n >= s.minimum)
      );
    }
    case 'boolean':
      return typeof v === 'boolean' || v === 'true' || v === 'false';
    case 'array': {
      const list: unknown[] = Array.isArray(v) ? v : [v];
      return list.every((x) => typeof x === 'string');
    }
    default:
      return typeof v === 'string' && (!s.enum || enumMatch(v, s.enum));
  }
}

const argumentName = (key: string) =>
  key.replace(/[^\w.-]/g, '').slice(0, 40) || '(unnamed)';

const nameList = (names: string[]) =>
  names.length > MAX_NAMED_ARGUMENTS
    ? `${names.slice(0, MAX_NAMED_ARGUMENTS).join(', ')} and ${names.length - MAX_NAMED_ARGUMENTS} more`
    : names.join(', ');

const PERIOD_WORDS: Record<string, 'month' | 'year'> = {
  month: 'month',
  monthly: 'month',
  'per month': 'month',
  pm: 'month',
  year: 'year',
  yearly: 'year',
  annual: 'year',
  annually: 'year',
  'per year': 'year',
};

// The rejected search rebuilt with valid names: an unknown amount becomes maxPrice, or minPrice when the name says min.
export function correctedSearchCall(args: Record<string, unknown>): {
  call: Record<string, unknown>;
  dropped: string[];
} {
  const properties = SEARCH_PARAMETERS as Record<string, ArgumentSchema>;
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  const put = (key: string, value: unknown) => {
    if (out[key] === undefined) out[key] = value;
  };
  for (const [key, value] of Object.entries(args)) {
    if (isAbsent(value)) continue;
    const schema = Object.prototype.propertyIsEnumerable.call(properties, key)
      ? properties[key]
      : undefined;
    if (schema) {
      if (fitsSchema(value, schema)) put(key, value);
      else if (
        schema.type === 'string' &&
        Array.isArray(value) &&
        typeof value[0] === 'string'
      ) {
        put(key, value[0]);
      } else dropped.push(key);
      continue;
    }
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const amount = parseAmount(value);
    const currency = parseCurrency(text);
    if (PERIOD_WORDS[text]) put('budgetPeriod', PERIOD_WORDS[text]);
    else if (currency) put('budgetCurrency', currency);
    else if (amount.amount !== undefined && /bed|room|bhk/i.test(key)) {
      put('bedrooms', Math.floor(amount.amount));
    } else if (amount.amount !== undefined) {
      const slot =
        /min|from|least/i.test(key) && out.minPrice === undefined
          ? 'minPrice'
          : out.maxPrice === undefined
            ? 'maxPrice'
            : 'minPrice';
      put(slot, amount.amount);
      if (amount.currency) put('budgetCurrency', amount.currency);
    } else dropped.push(argumentName(key));
  }
  return { call: out, dropped };
}

function repeatedRejection(args: Record<string, unknown>): string {
  const { call, dropped } = correctedSearchCall(args);
  const left = dropped.length
    ? ` Left out, since no valid argument fits by type: ${nameList(dropped)}.`
    : '';
  return `This is a repeated rejection. Copy this call, built from your arguments with the names corrected: search_properties ${JSON.stringify(call)}${left}`;
}

// Names and types come from the tool's own JSON schema; values the parsers would drop are reported, never echoed.
export function toolArgumentProblems(
  name: string,
  args: Record<string, unknown>,
  rejectedBefore = 0,
): string | null {
  const tool = TOOL_DEFINITIONS.find((t) => t.function.name === name);
  if (!tool) return null;
  const properties = tool.function.parameters.properties as Record<
    string,
    ArgumentSchema
  >;
  const unknown: string[] = [];
  const wrong: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    const schema = Object.prototype.propertyIsEnumerable.call(properties, key)
      ? properties[key]
      : undefined;
    if (!schema) {
      unknown.push(argumentName(key));
      continue;
    }
    if (isAbsent(value) || fitsSchema(value, schema)) continue;
    wrong.push(
      `${key} must be ${expectedType(schema)}, not ${receivedType(value)}`,
    );
  }
  const missing = budgetProblem(name, args);
  if (!unknown.length && !wrong.length && !missing) return null;
  const example = name === 'search_properties' ? SEARCH_EXAMPLE : undefined;
  const valid = Object.entries(properties).map(
    ([key, s]) => `${key} (${expectedType(s)})`,
  );
  return [
    unknown.length ? `Unknown argument(s): ${nameList(unknown)}.` : '',
    wrong.length ? `Wrong type: ${wrong.join('; ')}.` : '',
    missing,
    valid.length
      ? `Valid arguments: ${valid.join(', ')}.`
      : 'This tool takes no arguments.',
    unknown.length && example
      ? `Use only these names, for example: ${name} ${example}`
      : '',
    rejectedBefore > 0 && name === 'search_properties'
      ? repeatedRejection(args)
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export type HandoffReason = 'request' | 'complaint';

export interface ToolOutcome {
  text: string;
  listings?: Listing[];
  escalation?: HandoffReason;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  companyId: string,
  userId: string,
  repo: WhatsappAiRepositoryService,
  fallbackCurrency: string,
): Promise<ToolOutcome> {
  if (name === 'search_properties') {
    const filters = parseSearchArgs(args);
    const result = await repo.searchProperties(companyId, userId, filters);
    return {
      text: formatSearchResult(result, filters, fallbackCurrency),
      listings: searchListings(result),
    };
  }
  if (name === 'list_locations') {
    const rows = await repo.listLocations(
      companyId,
      userId,
      listingType(args.type),
    );
    return { text: formatLocations(rows, fallbackCurrency) };
  }
  if (name === 'escalate_to_staff') {
    const reason =
      typeof args.reason === 'string' &&
      args.reason.trim().toLowerCase() === 'complaint'
        ? 'complaint'
        : 'request';
    return { text: ESCALATED_RESULT, escalation: reason };
  }
  return { text: 'Unknown tool.' };
}
