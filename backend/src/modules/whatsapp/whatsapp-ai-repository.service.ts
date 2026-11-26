import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  MoreThan,
  Not,
  Raw,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { acquireCompanyLock } from '@shared/utils/company-lock.util';
import {
  Company,
  AI_CONVERSATION_WINDOW_MS,
} from '../companies/entities/company.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import {
  MediaType,
  PropertyMedia,
} from '../properties/entities/property-media.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import { BillingHistory } from '../billing/entities/billing-history.entity';
import { User } from '../users/entities/user.entity';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { AiCreditUsage } from './entities/ai-credit-usage.entity';
import { AiCreditAgentUsage } from './wa-types';
import {
  PAGE_SIZE,
  PRICE_SORTS,
  kindSubTypes,
  needsCity,
  routePlaces,
  type AreaCount,
  type CurrencyCount,
  type PropertySearchFilters,
  type PropertySearchResult,
} from './whatsapp-ai-tools';
import {
  PlaceRow,
  TermResolution,
  buildPlaceIndex,
  buildUnitIndex,
  confidentPlace,
  limitSuggestions,
  matchCity,
  namedCountries,
  resolvePlaceGroup,
  unitCore,
} from './whatsapp-ai-places';
import { RedisService } from '../redis/redis.service';
import { companyPlacesCacheKey } from '../properties/properties.service';
import { scopedRegionCodes } from '@shared/utils/region-visibility.util';
import {
  REGIONS,
  getRegionByCode,
  regionCurrency,
} from '@shared/constants/regions';

const MAX_AREAS = 8;

// SQL twin of storedUnitCore: no punctuation, no leading word, no leading zeros.
const UNIT_CORE_SQL =
  "regexp_replace(regexp_replace(lower(regexp_replace(u.unitNumber, '[^a-zA-Z0-9]', '', 'g')), '^[a-z]{2,}([0-9])', '\\1'), '^0+([0-9])', '\\1')";

const LISTING_TYPES: Record<'RENT' | 'SALE', PropertyType> = {
  RENT: PropertyType.RENTAL,
  SALE: PropertyType.FOR_SALE,
};

interface PriceCondition {
  sql: string;
  params: Record<string, number>;
}

interface TallyRow {
  regionCode: string;
  currency: string;
  localityId: string;
  area: string;
  city: string;
  matching: number;
  inBudget: number;
  minMatching?: number;
  maxMatching?: number;
  minInBudget?: number;
  maxInBudget?: number;
}

// Counts per currency, largest first, with the price range when asked for.
function byCurrency(
  rows: TallyRow[],
  count: (t: TallyRow) => number,
  min?: (t: TallyRow) => number | undefined,
  max?: (t: TallyRow) => number | undefined,
): CurrencyCount[] {
  const out = new Map<string, CurrencyCount>();
  for (const t of rows) {
    const n = count(t);
    if (!n) continue;
    const c = out.get(t.currency) ?? { currency: t.currency, count: 0 };
    c.count += n;
    const lo = min?.(t);
    const hi = max?.(t);
    if (lo !== undefined)
      c.min = c.min === undefined ? lo : Math.min(c.min, lo);
    if (hi !== undefined)
      c.max = c.max === undefined ? hi : Math.max(c.max, hi);
    out.set(t.currency, c);
  }
  return [...out.values()].sort(
    (a, b) => b.count - a.count || a.currency.localeCompare(b.currency),
  );
}

// Cities with matching listings, most first.
const without = (
  filters: PropertySearchFilters,
  keys: (keyof PropertySearchFilters)[],
): PropertySearchFilters =>
  Object.fromEntries(
    Object.entries(filters).filter(
      ([k]) => !keys.includes(k as keyof PropertySearchFilters),
    ),
  ) as PropertySearchFilters;

const cityTally = (rows: TallyRow[]) => {
  const counts = new Map<string, number>();
  for (const t of rows) {
    if (t.matching) counts.set(t.city, (counts.get(t.city) ?? 0) + t.matching);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const byCount = (a: AreaCount, b: AreaCount) =>
  b.count - a.count || a.area.localeCompare(b.area);

const areaTally = (rows: TallyRow[]): AreaCount[] => {
  const areas = new Map<string, AreaCount>();
  for (const t of rows) {
    const a = areas.get(t.localityId) ?? {
      area: t.area,
      city: t.city,
      count: 0,
    };
    a.count += t.matching;
    areas.set(t.localityId, a);
  }
  return [...areas.values()].sort(byCount);
};

const cityAreas = (rows: PlaceRow[], city: string): AreaCount[] => {
  const areas = new Map<string, AreaCount>();
  for (const r of rows.filter((x) => x.cityName === city)) {
    const a = areas.get(r.localityId) ?? {
      area: r.localityName,
      city,
      count: 0,
    };
    a.count += r.count;
    areas.set(r.localityId, a);
  }
  return [...areas.values()].sort(byCount);
};

// A place term whose areas or buildings lie in more than one city, with no city given: the customer picks the city.
const cityChoice = (terms: TermResolution[]) => {
  for (const t of terms) {
    if (t.status !== 'matched') continue;
    const options = t.matches
      .filter((m) => m.level === 'area' || m.level === 'building')
      .map((m) => ({ place: m.name, city: matchCity(m) ?? '' }));
    if (new Set(options.map((o) => o.city)).size > 1) {
      return { label: t.label, options };
    }
  }
  return undefined;
};

interface ContextCache {
  units: Unit[];
  cachedAt: number;
}

interface PromptCache {
  prompt: string | null;
  cachedAt: number;
  ttl: number;
}

interface AnchorCache {
  anchor: Date;
  cachedAt: number;
}

interface CompanyPlaces {
  rows: PlaceRow[];
  amenities: string[];
  units: { assetId: string; unitNumber: string | null }[];
}

interface CompanyCache {
  company: Company | null;
  cachedAt: number;
}

const webLinkSql = (column: string): string => `${column} ~* '^https?://'`;

// Caches are process-local: on multi-instance deploys, prompt edits stay stale until TTL
@Injectable()
export class WhatsappAiRepositoryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappAiRepositoryService.name);
  private contextCache = new Map<string, ContextCache>();
  private promptCache = new Map<string, PromptCache>();
  private anchorCache = new Map<string, AnchorCache>();
  private companyCache = new Map<string, CompanyCache>();
  private readonly CONTEXT_TTL_MS = 5 * 60 * 1000;
  private readonly PROMPT_TTL_MS = 2 * 60 * 1000;
  private readonly PROMPT_NULL_TTL_MS = 30 * 1000;
  private readonly ANCHOR_TTL_MS = 5 * 60 * 1000;
  private readonly COMPANY_TTL_MS = 5 * 60 * 1000;
  private readonly PLACES_TTL_MS = 10 * 60 * 1000;
  private readonly SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(WhatsappSettings)
    private readonly settingsRepo: Repository<WhatsappSettings>,
    @InjectRepository(WhatsappAiConversation)
    private readonly conversationRepo: Repository<WhatsappAiConversation>,
    @InjectRepository(AiCreditUsage)
    private readonly usageRepo: Repository<AiCreditUsage>,
    @InjectRepository(BillingHistory)
    private readonly billingHistoryRepo: Repository<BillingHistory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redis: RedisService,
    @InjectRepository(PropertyMedia)
    private readonly mediaRepo: Repository<PropertyMedia>,
  ) {}

  onModuleInit(): void {
    this.sweepInterval = setInterval(
      () => this.sweepExpired(),
      this.SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  // TTL is enforced only on re-read; a quiet company would keep hydrated data pinned forever
  private sweepExpired(): void {
    const now = Date.now();
    const drop = <V extends { cachedAt: number }>(
      map: Map<string, V>,
      ttl: number,
    ): void => {
      for (const [key, entry] of map.entries()) {
        if (now - entry.cachedAt >= ttl) map.delete(key);
      }
    };
    drop(this.contextCache, this.CONTEXT_TTL_MS);
    drop(this.anchorCache, this.ANCHOR_TTL_MS);
    drop(this.companyCache, this.COMPANY_TTL_MS);
    for (const [key, entry] of this.promptCache.entries()) {
      if (now - entry.cachedAt >= entry.ttl) this.promptCache.delete(key);
    }
  }

  async getCompany(companyId: string): Promise<Company | null> {
    const cached = this.companyCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.COMPANY_TTL_MS) {
      return cached.company;
    }
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    this.companyCache.set(companyId, { company, cachedAt: Date.now() });
    return company;
  }

  async getCompanyAndUnits(
    companyId: string,
  ): Promise<{ company: Company | null; units: Unit[] }> {
    const cached = this.contextCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.CONTEXT_TTL_MS) {
      return { company: await this.getCompany(companyId), units: cached.units };
    }
    // Reuses getCompany's cache so enforcement and UI paths don't read allowances that expire apart
    const [company, units] = await Promise.all([
      this.getCompany(companyId),
      this.unitRepo.find({
        where: { companyId, status: UnitStatus.AVAILABLE, deletedAt: IsNull() },
        relations: ['asset', 'asset.locality', 'asset.locality.city'],
        order: { createdAt: 'DESC' },
        take: 40,
      }),
    ]);
    this.contextCache.set(companyId, { units, cachedAt: Date.now() });
    return { company, units };
  }

  private async searchScope(
    companyId: string,
    userId: string,
  ): Promise<string[] | null | false> {
    const user = await this.userRepo.findOne({
      where: { id: userId, companyId },
      select: ['id', 'role', 'regionCodes'],
    });
    if (!user) return false;
    const regionCodes = scopedRegionCodes({
      role: user.role,
      regionCodes: user.regionCodes ?? [],
    });
    return regionCodes && regionCodes.length === 0 ? false : regionCodes;
  }

  private scopedUnits(
    companyId: string,
    regionCodes: string[] | null,
    withSelect: boolean,
  ): SelectQueryBuilder<Unit> {
    const qb = this.unitRepo.createQueryBuilder('u');
    if (withSelect) {
      qb.leftJoinAndSelect('u.asset', 'a')
        .leftJoinAndSelect('a.locality', 'l')
        .leftJoinAndSelect('l.city', 'ci');
    } else {
      qb.innerJoin('u.asset', 'a')
        .innerJoin('a.locality', 'l')
        .innerJoin('l.city', 'ci');
    }
    qb.where('u.companyId = :companyId', { companyId })
      .andWhere('u.status = :status', { status: UnitStatus.AVAILABLE })
      .andWhere('u.deletedAt IS NULL');
    if (regionCodes) {
      qb.andWhere('ci.regionCode IN (:...regionCodes)', { regionCodes });
    }
    return qb;
  }

  private async placeRows(companyId: string): Promise<PlaceRow[]> {
    const raw = await this.scopedUnits(companyId, null, false)
      .select('a.id', 'assetId')
      .addSelect('a.name', 'assetName')
      .addSelect('l.id', 'localityId')
      .addSelect('l.name', 'localityName')
      .addSelect('ci.id', 'cityId')
      .addSelect('ci.name', 'cityName')
      .addSelect('ci.regionCode', 'regionCode')
      .addSelect('ci.country', 'country')
      .addSelect('u.propertyType', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.id')
      .addGroupBy('l.id')
      .addGroupBy('ci.id')
      .addGroupBy('u.propertyType')
      .getRawMany<Omit<PlaceRow, 'count'> & { count: string }>();
    return raw.map((r) => ({ ...r, count: Number(r.count) }));
  }

  // Places, amenities and unit numbers in one company-wide cache entry; every unit write clears it.
  private async companyPlaces(companyId: string): Promise<CompanyPlaces> {
    return this.redis.getOrSetJson<CompanyPlaces>(
      companyPlacesCacheKey(companyId),
      this.PLACES_TTL_MS,
      async () => {
        const rows = await this.placeRows(companyId);
        const amenities = await this.scopedUnits(companyId, null, false)
          .select('DISTINCT jsonb_array_elements_text(u.amenities)', 'key')
          .getRawMany<{ key: string }>();
        const units = await this.scopedUnits(companyId, null, false)
          .select('u.unitNumber', 'unitNumber')
          .addSelect('a.id', 'assetId')
          .groupBy('u.unitNumber')
          .addGroupBy('a.id')
          .getRawMany<{ assetId: string; unitNumber: string | null }>();
        return { rows, amenities: amenities.map((r) => r.key), units };
      },
    );
  }

  private async placeData(
    companyId: string,
    scope: string[] | null,
  ): Promise<CompanyPlaces> {
    const places = await this.companyPlaces(companyId);
    return scope
      ? {
          ...places,
          rows: places.rows.filter((r) => scope.includes(r.regionCode)),
        }
      : places;
  }

  // Region-scoped like every other read: the same scope backs place matching and inventory.
  async listLocations(
    companyId: string,
    userId: string,
    type?: 'RENT' | 'SALE',
  ): Promise<PlaceRow[]> {
    const scope = await this.searchScope(companyId, userId);
    if (scope === false) return [];
    const { rows } = await this.placeData(companyId, scope);
    const wanted = type ? LISTING_TYPES[type] : undefined;
    return wanted ? rows.filter((r) => r.type === wanted) : rows;
  }

  async searchProperties(
    companyId: string,
    userId: string,
    filters: PropertySearchFilters,
  ): Promise<PropertySearchResult> {
    const scope = await this.searchScope(companyId, userId);
    if (scope === false) return { units: [], total: 0 };
    const result = await this.search(companyId, scope, filters);
    if (!result.total && !result.cityNeeded && !result.cityChoice) {
      const applied = result.applied ?? filters;
      if (applied.unit && (applied.city?.length || applied.place?.length)) {
        const alone = await this.search(
          companyId,
          scope,
          without(applied, ['city', 'place', 'placePositions']),
        );
        if (alone.total) {
          return this.withPhotoCounts(companyId, {
            ...alone,
            unitElsewhere: true,
          });
        }
      }
      if (applied.kind?.length || applied.amenities?.length) {
        const rest = await this.search(
          companyId,
          scope,
          without(applied, ['kind', 'amenities', 'page']),
        );
        result.unfiltered = rest.total;
      }
      const countries = this.contextCountries(result.locations ?? [], applied);
      const rows = (
        await this.otherListings(
          companyId,
          scope,
          applied,
          applied.budgetCurrency ?? result.budgetInferred,
        )
      ).filter(
        (t) =>
          !countries.size ||
          countries.has(getRegionByCode(t.regionCode)?.country ?? ''),
      );
      result.citiesWithListings = cityTally(rows);
      if (result.unknownPlaceIn) {
        const { rows: placeRows } = await this.placeData(companyId, scope);
        for (const entry of result.unknownPlaceIn) {
          const inCity = rows.filter((t) => t.city === entry.city);
          const byArea = inCity.length
            ? areaTally(inCity)
            : cityAreas(placeRows, entry.city);
          entry.areas = byArea.slice(0, MAX_AREAS);
          entry.moreAreas = Math.max(0, byArea.length - MAX_AREAS);
        }
      }
    }
    return this.withPhotoCounts(companyId, result);
  }

  // One grouped query for the image counts of the returned units, web links only, as photos can be sent only from those.
  private async withPhotoCounts(
    companyId: string,
    result: PropertySearchResult,
  ): Promise<PropertySearchResult> {
    const unitIds = result.units.map((u) => u.id);
    if (!unitIds.length) return result;
    let rows: { unitId: string; count: string }[];
    try {
      rows = await this.mediaRepo
        .createQueryBuilder('m')
        .select('m.unitId', 'unitId')
        .addSelect('COUNT(*)', 'count')
        .where('m.companyId = :companyId', { companyId })
        .andWhere('m.unitId IN (:...unitIds)', { unitIds })
        .andWhere('m.type = :type', { type: MediaType.IMAGE })
        .andWhere(webLinkSql('m.url'))
        .groupBy('m.unitId')
        .getRawMany<{ unitId: string; count: string }>();
    } catch (err) {
      this.logger.warn(
        `Photo counts unavailable for company ${companyId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return result;
    }
    const counts = new Map(rows.map((r) => [r.unitId, Number(r.count)]));
    result.photos = Object.fromEntries(
      unitIds.map((id) => [id, counts.get(id) ?? 0]),
    );
    return result;
  }

  // Listings matching everything but the city, place and unit, counted within the budget when its currency is known.
  private async otherListings(
    companyId: string,
    scope: string[] | null,
    filters: PropertySearchFilters,
    budget: string | undefined,
  ): Promise<TallyRow[]> {
    const rest = { ...filters };
    for (const key of [
      'city',
      'place',
      'placePositions',
      'unit',
      'unitAlt',
      'page',
    ] as const) {
      delete rest[key];
    }
    const price = this.priceCondition(rest);
    const rows = await this.tally(companyId, scope, rest, null, price);
    const priced = price && budget && !rest.unknownCurrency;
    return rows
      .map((t) => ({
        ...t,
        matching: !priced ? t.matching : t.currency === budget ? t.inBudget : 0,
      }))
      .filter((t) => t.matching > 0);
  }

  private async search(
    companyId: string,
    scope: string[] | null,
    parsed: PropertySearchFilters,
  ): Promise<PropertySearchResult> {
    let filters = parsed;
    const page = filters.page ?? 1;
    const offset = (page - 1) * PAGE_SIZE;
    const result: PropertySearchResult = {
      units: [],
      total: 0,
      offset,
      locations: [],
    };
    let assetIds: string[] | null = null;
    const places =
      filters.city?.length || filters.place?.length || filters.unit
        ? await this.placeData(companyId, scope)
        : undefined;
    const index = places && buildPlaceIndex(places.rows);
    if (places && index && (filters.place?.length || filters.unit)) {
      const routed = routePlaces(
        filters,
        new Set(filters.place?.length ? places.amenities : []),
        index,
        buildUnitIndex(places.units),
      );
      if (routed.notes.length) {
        filters = routed.filters;
        result.applied = filters;
        result.routed = routed.notes;
      }
    }
    if (
      filters.unit &&
      (filters.minPrice !== undefined || filters.maxPrice !== undefined)
    ) {
      filters = { ...filters };
      for (const key of [
        'minPrice',
        'maxPrice',
        'budgetCurrency',
        'unknownCurrency',
        'budgetPeriod',
        'budgetSwapped',
      ] as const) {
        delete filters[key];
      }
      result.applied = filters;
      result.unitWithoutBudget = true;
    }
    let preset: TallyRow[] | undefined;
    if (needsCity(filters)) {
      preset = await this.tally(companyId, scope, filters, null, null);
      const cities = cityTally(preset);
      if (cities.length > 1) {
        result.cityNeeded = true;
        result.citiesWithListings = cities;
        return result;
      }
    }
    if (places && index) {
      let within: Set<string> | undefined;
      const groups = [
        ['city', filters.city],
        ['place', filters.place],
      ] as const;
      for (const [group, values] of groups) {
        if (!values?.length) continue;
        const resolved = resolvePlaceGroup(
          index,
          values,
          group,
          within,
          group === 'place' ? filters.placePositions : undefined,
        );
        if (within && group === 'place') {
          for (const term of resolved.terms) {
            if (term.status !== 'unknown') continue;
            const outside = resolvePlaceGroup(index, [term.term], 'place')
              .terms[0];
            if (
              outside?.status === 'matched' &&
              confidentPlace(index, term.term)
            ) {
              term.elsewhere = outside.matches.filter((m) => matchCity(m));
            }
          }
          if (
            !resolved.assetIds.length &&
            resolved.terms.some(
              (t) => t.status === 'unknown' && !t.elsewhere?.length,
            )
          ) {
            const cities = [
              ...new Set(
                places.rows
                  .filter((r) => within!.has(r.assetId))
                  .map((r) => r.cityName),
              ),
            ].sort();
            result.unknownPlaceIn = cities.map((city) => ({
              city,
              areas: [],
              moreAreas: 0,
            }));
          }
        }
        result.locations!.push(...resolved.terms);
        const choice =
          group === 'place' && !filters.city?.length && !filters.unit
            ? cityChoice(resolved.terms)
            : undefined;
        if (choice) {
          result.cityChoice = choice;
          return result;
        }
        within = new Set(resolved.assetIds);
        if (!within.size) break;
      }
      result.locations = limitSuggestions(
        result.locations!,
        this.contextCountries(result.locations!, filters),
      );
      if (within && !within.size) return result;
      assetIds = within ? [...within] : null;
    }

    const price = this.priceCondition(filters);
    if (
      price &&
      assetIds &&
      !filters.budgetCurrency &&
      !filters.unknownCurrency
    ) {
      const currency = await this.placeCurrency(companyId, scope, assetIds);
      if (currency) {
        filters = { ...filters, budgetCurrency: currency };
        result.applied = filters;
      }
    }
    const tally =
      preset ?? (await this.tally(companyId, scope, filters, assetIds, price));
    const matching = byCurrency(tally, (t) => t.matching);
    // A budget with no currency of its own is compared with each listing in that listing's currency.
    let budget = price ? filters.budgetCurrency : undefined;
    if (price && !budget && !filters.unknownCurrency && matching.length === 1) {
      budget = matching[0].currency;
      result.budgetInferred = budget;
    }

    const counted = tally.filter((t) => !budget || t.currency === budget);
    const inBudget = (t: TallyRow) => (price ? t.inBudget : t.matching);
    result.total = counted.reduce((s, t) => s + inBudget(t), 0);
    result.currencies = byCurrency(
      counted,
      inBudget,
      (t) => (price ? t.minInBudget : t.minMatching),
      (t) => (price ? t.maxInBudget : t.maxMatching),
    );
    if (budget) {
      result.otherCurrency = matching
        .filter((c) => c.currency !== budget)
        .map(({ currency, count }) => ({ currency, count }));
    }
    const areas = new Map<string, AreaCount>();
    for (const t of counted) {
      const area = areas.get(t.localityId) ?? {
        area: t.area,
        city: t.city,
        count: 0,
      };
      area.count += inBudget(t);
      areas.set(t.localityId, area);
    }
    const byArea = [...areas.values()]
      .filter((a) => a.count > 0)
      .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
    result.areas = byArea.slice(0, MAX_AREAS);
    result.moreAreas = Math.max(0, byArea.length - MAX_AREAS);

    if (result.total <= offset) return result;
    const qb = this.scopedUnits(companyId, scope, true);
    this.applyFilters(qb, filters, assetIds);
    if (price) qb.andWhere(price.sql, price.params);
    if (price && budget) {
      qb.andWhere('ci.regionCode IN (:...budgetRegions)', {
        budgetRegions: REGIONS.filter((r) => r.currency === budget).map(
          (r) => r.code,
        ),
      });
    }
    const order: Record<string, [string, 'ASC' | 'DESC']> = {
      price_low: ['u.price', 'ASC'],
      price_high: ['u.price', 'DESC'],
      largest: ['u.sqFt', 'DESC'],
    };
    const [column, direction] = order[filters.sort ?? ''] ?? [
      'u.createdAt',
      'DESC',
    ];
    if (
      PRICE_SORTS.includes(filters.sort ?? '') &&
      result.currencies.length > 1
    ) {
      const rank = new Map(result.currencies.map((c, i) => [c.currency, i]));
      const regions = [...new Set(counted.map((t) => t.regionCode))];
      const currencyRank =
        '(CAST(:currencyRanks AS int[]))[array_position(CAST(:rankedRegions AS text[]), ci.regionCode)]';
      qb.orderBy(
        `ROW_NUMBER() OVER (PARTITION BY ${currencyRank} ORDER BY ${column} ${direction} NULLS LAST, u.id ASC)`,
      )
        .addOrderBy(currencyRank)
        .setParameter('rankedRegions', regions)
        .setParameter(
          'currencyRanks',
          regions.map((r) => rank.get(regionCurrency(r)) ?? 0),
        );
    } else {
      qb.orderBy(column, direction, 'NULLS LAST');
    }
    result.units = await qb
      .addOrderBy('u.id', 'ASC')
      .offset(offset)
      .limit(PAGE_SIZE)
      .getMany();
    return result;
  }

  // The countries the search names through its places or its budget currency.
  private contextCountries(
    terms: TermResolution[],
    filters: PropertySearchFilters,
  ): Set<string> {
    const countries = namedCountries(terms);
    for (const region of REGIONS) {
      if (region.currency === filters.budgetCurrency) {
        countries.add(region.country);
      }
    }
    return countries;
  }

  // The one currency the searched buildings are priced in, if they share one.
  private async placeCurrency(
    companyId: string,
    scope: string[] | null,
    assetIds: string[],
  ): Promise<string | undefined> {
    const wanted = new Set(assetIds);
    const { rows } = await this.placeData(companyId, scope);
    const currencies = new Set(
      rows
        .filter((r) => wanted.has(r.assetId))
        .map((r) => regionCurrency(r.regionCode)),
    );
    return currencies.size === 1 ? [...currencies][0] : undefined;
  }

  // One grouped read gives the total, the area counts and the per-currency counts, with and without the budget.
  private async tally(
    companyId: string,
    scope: string[] | null,
    filters: PropertySearchFilters,
    assetIds: string[] | null,
    price: PriceCondition | null,
  ): Promise<TallyRow[]> {
    const qb = this.scopedUnits(companyId, scope, false);
    this.applyFilters(qb, filters, assetIds);
    const inBudget = price ? ` FILTER (WHERE ${price.sql})` : '';
    if (price) qb.setParameters(price.params);
    const raw = await qb
      .select('ci.regionCode', 'regionCode')
      .addSelect('l.id', 'localityId')
      .addSelect('l.name', 'area')
      .addSelect('ci.name', 'city')
      .addSelect('COUNT(*)', 'matching')
      .addSelect(`COUNT(*)${inBudget}`, 'inBudget')
      .addSelect('MIN(u.price)', 'minMatching')
      .addSelect('MAX(u.price)', 'maxMatching')
      .addSelect(`MIN(u.price)${inBudget}`, 'minInBudget')
      .addSelect(`MAX(u.price)${inBudget}`, 'maxInBudget')
      .groupBy('ci.regionCode')
      .addGroupBy('l.id')
      .addGroupBy('ci.id')
      .getRawMany<Record<string, string | null>>();
    const num = (v: string | null) => (v === null ? undefined : Number(v));
    return raw.map((r) => ({
      regionCode: r.regionCode as string,
      currency: regionCurrency(r.regionCode),
      localityId: r.localityId as string,
      area: r.area as string,
      city: r.city as string,
      matching: Number(r.matching),
      inBudget: Number(r.inBudget),
      minMatching: num(r.minMatching),
      maxMatching: num(r.maxMatching),
      minInBudget: num(r.minInBudget),
      maxInBudget: num(r.maxInBudget),
    }));
  }

  private applyFilters(
    qb: SelectQueryBuilder<Unit>,
    filters: PropertySearchFilters,
    assetIds: string[] | null,
  ): void {
    if (assetIds) {
      qb.andWhere('a.id = ANY(CAST(:assetIds AS uuid[]))', { assetIds });
    }
    if (filters.type) {
      qb.andWhere('u.propertyType = :pt', { pt: LISTING_TYPES[filters.type] });
    }
    const subTypes = kindSubTypes(filters.kind ?? []);
    if (subTypes.length) {
      qb.andWhere('u.subType IN (:...subTypes)', { subTypes });
    }
    if (filters.unit) {
      const unitKeys = [
        ...new Set(
          [filters.unit, filters.unitAlt]
            .filter((k): k is string => Boolean(k))
            .map(unitCore),
        ),
      ];
      qb.andWhere(`${UNIT_CORE_SQL} IN (:...unitKeys)`, { unitKeys });
    }
    if (filters.minBedrooms !== undefined) {
      qb.andWhere('u.bedrooms >= :minBedrooms', {
        minBedrooms: filters.minBedrooms,
      });
    }
    if (filters.maxBedrooms !== undefined) {
      qb.andWhere('u.bedrooms <= :maxBedrooms', {
        maxBedrooms: filters.maxBedrooms,
      });
    }
    if (filters.minBathrooms !== undefined) {
      qb.andWhere('u.bathrooms >= :minBathrooms', {
        minBathrooms: filters.minBathrooms,
      });
    }
    if (filters.minSqft !== undefined) {
      qb.andWhere('u.sqFt >= :minSqft', { minSqft: filters.minSqft });
    }
    if (filters.maxSqft !== undefined) {
      qb.andWhere('u.sqFt <= :maxSqft', { maxSqft: filters.maxSqft });
    }
    (filters.amenities ?? []).forEach((keys, i) => {
      qb.andWhere(`u.amenities ?| CAST(:amenity${i} AS text[])`, {
        [`amenity${i}`]: keys,
      });
    });
  }

  // Rent is stored per month; a budget with no period is read on the period it is closer to.
  private priceCondition(
    filters: PropertySearchFilters,
  ): PriceCondition | null {
    const params: Record<string, number> = {};
    if (filters.minPrice !== undefined) params.minPrice = filters.minPrice;
    if (filters.maxPrice !== undefined) params.maxPrice = filters.maxPrice;
    if (!Object.keys(params).length) return null;
    const fits = (price: string) =>
      [
        filters.minPrice !== undefined ? `${price} >= :minPrice` : '',
        filters.maxPrice !== undefined ? `${price} <= :maxPrice` : '',
      ]
        .filter(Boolean)
        .join(' AND ');
    const rental = `u.propertyType = '${PropertyType.RENTAL}'`;
    const monthly = fits('u.price');
    const yearly = fits('u.price * 12');
    if (filters.budgetPeriod === 'year') {
      return {
        sql: `(CASE WHEN ${rental} THEN ${yearly} ELSE ${monthly} END)`,
        params,
      };
    }
    if (filters.budgetPeriod === 'month') return { sql: monthly, params };
    // No period: a rental's yearly figure is used when the budget is closer to it than to the monthly rent (log midpoint).
    const reference = filters.maxPrice ?? filters.minPrice!;
    params.budgetReference = reference;
    return {
      sql: `(CASE WHEN ${rental} AND :budgetReference >= u.price * ${Math.sqrt(12).toFixed(4)} THEN ${yearly} ELSE ${monthly} END)`,
      params,
    };
  }

  // Null when the unit is no longer an available listing of the company; links are images only, primary first, then newest.
  async unitPhotoLinks(
    companyId: string,
    unitId: string,
    limit: number,
  ): Promise<{ unit: Unit; links: string[] } | null> {
    const unit = await this.unitRepo.findOne({
      where: {
        id: unitId,
        companyId,
        status: UnitStatus.AVAILABLE,
        deletedAt: IsNull(),
      },
      relations: ['asset', 'asset.locality', 'asset.locality.city'],
    });
    if (!unit) return null;
    const media = await this.mediaRepo.find({
      where: {
        companyId,
        unitId,
        type: MediaType.IMAGE,
        url: Raw(webLinkSql),
      },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
      select: ['id', 'url'],
      take: limit,
    });
    return {
      unit,
      links: media.map((m) => m.url),
    };
  }

  async getCompanyPrompt(companyId: string): Promise<string | null> {
    const cached = this.promptCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < cached.ttl) {
      return cached.prompt;
    }
    const settings = await this.settingsRepo.findOne({ where: { companyId } });
    const prompt = settings?.aiPrompt || null;
    const ttl = prompt ? this.PROMPT_TTL_MS : this.PROMPT_NULL_TTL_MS;
    this.promptCache.set(companyId, { prompt, cachedAt: Date.now(), ttl });
    return prompt;
  }

  async persistAiEnabled(companyId: string, value: boolean): Promise<void> {
    await this.settingsRepo.upsert({ companyId, aiEnabled: value }, [
      'companyId',
    ]);
  }

  async loadAiEnabled(companyId: string): Promise<boolean | null> {
    const row = await this.settingsRepo.findOne({
      where: { companyId },
      select: { aiEnabled: true },
    });
    return row?.aiEnabled ?? null;
  }

  async getPeriodAnchor(company: Company): Promise<Date> {
    const cached = this.anchorCache.get(company.id);
    if (cached && Date.now() - cached.cachedAt < this.ANCHOR_TTL_MS) {
      return cached.anchor;
    }
    const row = await this.billingHistoryRepo.findOne({
      where: { companyId: company.id, periodStart: Not(IsNull()) },
      order: { periodStart: 'DESC', occurredAt: 'DESC' },
      select: { periodStart: true },
    });
    const anchor = row?.periodStart ?? company.createdAt;
    this.anchorCache.set(company.id, { anchor, cachedAt: Date.now() });
    return anchor;
  }

  // Not the usage row: its key includes period_start, so boundary turns would lock different rows
  async consumeConversationCredit(
    companyId: string,
    userId: string,
    chatId: string,
    allowance: number,
    period: { start: Date; end: Date },
  ): Promise<{
    allowed: boolean;
    charged: boolean;
    conversationId: string | null;
  }> {
    return this.settingsRepo.manager.transaction(async (manager) => {
      const usageRepo = manager.getRepository(AiCreditUsage);
      const conversationRepo = manager.getRepository(WhatsappAiConversation);
      const chatRepo = manager.getRepository(WhatsappChat);

      await acquireCompanyLock(manager, companyId);

      await usageRepo
        .createQueryBuilder()
        .insert()
        .into(AiCreditUsage)
        .values({
          companyId,
          periodStart: period.start,
          periodEnd: period.end,
        })
        .orIgnore()
        .execute();

      const usage = await usageRepo
        .createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.companyId = :companyId', { companyId })
        .andWhere('u.periodStart = :periodStart', { periodStart: period.start })
        .getOne();

      if (!usage) {
        throw new Error(
          `ai_credit_usage row missing after upsert for company ${companyId}`,
        );
      }

      const now = new Date();
      const openWindow = await conversationRepo
        .createQueryBuilder('c')
        .where('c.companyId = :companyId', { companyId })
        .andWhere('c.userId = :userId', { userId })
        .andWhere('c.chatId = :chatId', { chatId })
        .andWhere('c.expiresAt > :now', { now })
        .orderBy('c.startedAt', 'DESC')
        .getOne();

      if (openWindow) {
        return { allowed: true, charged: false, conversationId: openWindow.id };
      }

      if (usage.creditsUsed >= allowance) {
        return { allowed: false, charged: false, conversationId: null };
      }

      // Reads phoneNumberId from the chat row (company+user+chat) so callers don't have to pass it in.
      const chat = await chatRepo.findOne({
        where: { companyId, userId, chatId },
        select: { phoneNumberId: true },
      });

      const conversation = await conversationRepo.save(
        conversationRepo.create({
          companyId,
          userId,
          chatId,
          phoneNumberId: chat?.phoneNumberId ?? null,
          leadId: null,
          startedAt: now,
          expiresAt: new Date(now.getTime() + AI_CONVERSATION_WINDOW_MS),
          messagesCount: 0,
          periodStart: period.start,
        }),
      );

      await usageRepo.increment(
        { companyId, periodStart: period.start },
        'creditsUsed',
        1,
      );

      return { allowed: true, charged: true, conversationId: conversation.id };
    });
  }

  // Same company lock as the charge; only a window no reply was delivered in is given back.
  async refundConversationCredit(
    companyId: string,
    conversationId: string,
    periodStart: Date,
  ): Promise<boolean> {
    return this.settingsRepo.manager.transaction(async (manager) => {
      await acquireCompanyLock(manager, companyId);
      const [deleted]: [{ id: string }[], number] = await manager.query(
        `DELETE FROM "whatsapp_ai_conversations"
          WHERE "id" = $1 AND "company_id" = $2 AND "messages_count" = 0
         RETURNING "id"`,
        [conversationId, companyId],
      );
      if (!deleted[0]) return false;
      await manager.query(
        `UPDATE "ai_credit_usage"
            SET "credits_used" = GREATEST("credits_used" - 1, 0), "updated_at" = now()
          WHERE "company_id" = $1 AND "period_start" = $2`,
        [companyId, periodStart],
      );
      return true;
    });
  }

  // Kept out of consumeConversationCredit so turns that die at the LLM never inflate the count
  async recordTurnDelivered(
    companyId: string,
    conversationId: string,
  ): Promise<void> {
    await this.conversationRepo.increment(
      { id: conversationId, companyId },
      'messagesCount',
      1,
    );
  }

  async getCreditUsage(
    companyId: string,
    periodStart: Date,
  ): Promise<{ used: number; openWindows: number }> {
    const [usage, openWindows] = await Promise.all([
      this.usageRepo.findOne({
        where: { companyId, periodStart },
        select: { creditsUsed: true },
      }),
      // Period-scoped so `used` and `openWindows` describe the same set of charged windows
      this.conversationRepo.count({
        where: { companyId, periodStart, expiresAt: MoreThan(new Date()) },
      }),
    ]);
    return { used: usage?.creditsUsed ?? 0, openWindows };
  }

  async getAgentCreditBreakdown(
    companyId: string,
    periodStart: Date,
  ): Promise<AiCreditAgentUsage[]> {
    const rows = await this.conversationRepo
      .createQueryBuilder('c')
      .select('c.userId', 'userId')
      .addSelect('COUNT(*)', 'credits')
      .addSelect('COALESCE(SUM(c.messagesCount), 0)', 'aiTurns')
      .addSelect('COUNT(DISTINCT c.chatId)', 'leads')
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.periodStart = :periodStart', { periodStart })
      .groupBy('c.userId')
      .getRawMany<{
        userId: string;
        credits: string;
        aiTurns: string;
        leads: string;
      }>();

    if (rows.length === 0) return [];

    const users = await this.userRepo.find({
      where: { id: In(rows.map((r) => r.userId)), companyId },
      select: { id: true, name: true, email: true },
    });
    const nameById = new Map(
      users.map((u) => [u.id, u.name?.trim() || u.email]),
    );

    return rows
      .map((r) => ({
        userId: r.userId,
        name: nameById.get(r.userId) ?? 'Removed user',
        credits: Number(r.credits),
        aiTurns: Number(r.aiTurns),
        leads: Number(r.leads),
      }))
      .sort((a, b) => b.credits - a.credits);
  }

  async claimExhaustedNotification(
    companyId: string,
    periodStart: Date,
  ): Promise<boolean> {
    const result = await this.usageRepo
      .createQueryBuilder()
      .update()
      .set({ exhaustedNotifiedAt: () => 'now()' })
      .where('company_id = :companyId', { companyId })
      .andWhere('period_start = :periodStart', { periodStart })
      .andWhere('exhausted_notified_at IS NULL')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  clearContextCache(companyId?: string): void {
    if (companyId) {
      this.contextCache.delete(companyId);
      this.anchorCache.delete(companyId);
      this.companyCache.delete(companyId);
    } else {
      this.contextCache.clear();
      this.anchorCache.clear();
      this.companyCache.clear();
    }
  }

  clearPromptCache(companyId?: string): void {
    if (companyId) this.promptCache.delete(companyId);
    else this.promptCache.clear();
  }
}
