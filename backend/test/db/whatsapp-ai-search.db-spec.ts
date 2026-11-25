import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { connectTestDatabase } from './test-data-source';
import { seedCompany, seeded } from './harness';
import { Company } from '../../src/modules/companies/entities/company.entity';
import { Unit } from '../../src/modules/properties/entities/unit.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { WhatsappAiRepositoryService } from '../../src/modules/whatsapp/whatsapp-ai-repository.service';
import { RedisService } from '../../src/modules/redis/redis.service';
import { companyPlacesCacheKey } from '../../src/modules/properties/properties.service';
import {
  PropertySearchResult,
  executeTool,
  formatSearchResult,
  parseSearchArgs,
  renderCards,
} from '../../src/modules/whatsapp/whatsapp-ai-tools';
import { trigramSimilarity } from '../../src/modules/whatsapp/whatsapp-ai-places';

interface Listing {
  unit: string;
  price: number;
  type?: 'RENTAL' | 'FOR_SALE';
  bedrooms?: number;
  amenities?: string[];
  kind?: string;
}

// [city, region, country, area, building, listings]
const PLACES: [string, string, string, string, string, Listing[]][] = [
  [
    'Dubai',
    'dubai',
    'AE',
    'Downtown',
    'Qasr Tower',
    [
      { unit: '101', price: 11500, amenities: ['ac', 'gym'] },
      { unit: '102', price: 19000, amenities: ['jacuzzi'] },
    ],
  ],
  [
    'Dubai',
    'dubai',
    'AE',
    'Dubai Marina',
    'Azure Quay',
    [
      { unit: '201', price: 10000, amenities: ['terrace'] },
      { unit: '202', price: 4200000, type: 'FOR_SALE', bedrooms: 3 },
    ],
  ],
  [
    'Sharjah',
    'sharjah',
    'AE',
    'Al Nahda',
    'Nahda View',
    [{ unit: '1103', price: 3500, amenities: ['power_backup'] }],
  ],
  [
    'Lahore',
    'punjab',
    'PK',
    'Gulberg',
    'Liberty Crest',
    [
      { unit: '7', price: 95000, amenities: ['ac'] },
      { unit: '8', price: 65000 },
      { unit: '9', price: 9000000, type: 'FOR_SALE', bedrooms: 3 },
    ],
  ],
  [
    'Lahore',
    'punjab',
    'PK',
    'DHA Phase 5',
    'Block D Homes',
    [{ unit: 'House 214', price: 180000, amenities: ['covered_parking'] }],
  ],
  [
    'Austin',
    'texas',
    'US',
    'Mueller',
    'Mueller Row Lofts',
    [
      { unit: '910', price: 1500 },
      { unit: '911', price: 2100 },
    ],
  ],
];

// In-memory stand-in for the commands the read-through cache uses; the service logic under test is real.
function memoryRedis(): RedisService {
  const store = new Map<string, string>();
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
    del: async (...keys: string[]) =>
      keys.reduce((n, k) => n + (store.delete(k) ? 1 : 0), 0),
  };
  return Object.assign(Object.create(RedisService.prototype) as RedisService, {
    client,
    logger: new Logger('memoryRedis'),
  });
}

const KARACHI: (typeof PLACES)[number] = [
  'Karachi',
  'sindh',
  'PK',
  'DHA Phase 6',
  'Khayaban Villas',
  [{ unit: 'Bungalow 12', price: 300000 }],
];

// The tally, the currency grouping, the jsonb amenity test and paging only prove themselves in Postgres.
describe('WhatsApp AI property search against a real database', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  async function seed(manager: EntityManager) {
    const company = await seedCompany(manager, 'AI Search Co', [
      'dubai',
      'sharjah',
      'punjab',
      'texas',
      'sindh',
    ]);
    const user: { id: string }[] = await manager.query(
      `INSERT INTO "users" ("email", "password", "name", "role", "company_id")
       VALUES ($1, 'x', 'Test User', 'company_admin', $2) RETURNING id`,
      [`ai-search-${company.id}@example.com`, company.id],
    );
    const cities = new Map<string, string>();
    const add = async ([city, region, country, area, building, listings]: [
      string,
      string,
      string,
      string,
      string,
      Listing[],
    ]) => {
      if (!cities.has(city)) {
        const row: { id: string }[] = await manager.query(
          `INSERT INTO "cities" ("name", "region_code", "country", "created_by_company_id")
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [city, region, country, company.id],
        );
        cities.set(city, row[0].id);
      }
      const locality: { id: string }[] = await manager.query(
        `INSERT INTO "localities" ("name", "city_id", "created_by_company_id")
         VALUES ($1, $2, $3) RETURNING id`,
        [area, cities.get(city), company.id],
      );
      const asset: { id: string }[] = await manager.query(
        `INSERT INTO "assets" ("name", "locality_id", "company_id")
         VALUES ($1, $2, $3) RETURNING id`,
        [building, locality[0].id, company.id],
      );
      for (const l of listings) {
        await manager.query(
          `INSERT INTO "units" ("unit_number", "asset_id", "company_id", "sub_type", "status",
             "property_type", "price", "bedrooms", "amenities")
           VALUES ($1, $2, $3, $8, 'available', $4, $5, $6, $7::jsonb)`,
          [
            l.unit,
            asset[0].id,
            company.id,
            l.type ?? 'RENTAL',
            l.price,
            l.bedrooms ?? 1,
            JSON.stringify(l.amenities ?? []),
            l.kind ?? 'APARTMENT',
          ],
        );
      }
    };
    for (const place of PLACES) await add(place);
    let queries = 0;
    const counting = new Proxy(manager.getRepository(Unit), {
      get(target, prop, receiver) {
        if (prop !== 'createQueryBuilder') {
          return Reflect.get(target, prop, receiver) as unknown;
        }
        return (alias: string) => {
          const qb = target.createQueryBuilder(alias);
          for (const run of ['getMany', 'getRawMany'] as const) {
            const original = qb[run].bind(qb) as () => Promise<unknown>;
            (qb as unknown as Record<string, unknown>)[run] = async () => {
              queries++;
              return original();
            };
          }
          return qb;
        };
      },
    });
    const redis = memoryRedis();
    const service = new WhatsappAiRepositoryService(
      manager.getRepository(Company),
      counting,
      null as never,
      null as never,
      null as never,
      null as never,
      manager.getRepository(User),
      redis,
    );
    const search = (args: Record<string, unknown>) =>
      service.searchProperties(company.id, user[0].id, parseSearchArgs(args));
    const run = (args: Record<string, unknown>) =>
      executeTool(
        'search_properties',
        args,
        company.id,
        user[0].id,
        service,
        'AED',
      );
    return {
      search,
      run,
      add,
      invalidate: () => redis.forget(companyPlacesCacheKey(company.id)),
      queries: () => queries,
      reset: () => (queries = 0),
    };
  }

  const units = (r: PropertySearchResult) => r.units.map((u) => u.unitNumber);

  it('finds an area written with its city, and only that area', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ place: ['Downtown Dubai'], type: 'RENT' }),
    );
    expect(r.total).toBe(2);
    expect(units(r).sort()).toEqual(['101', '102']);
    expect(r.units[0].asset.locality.name).toBe('Downtown');
  });

  it('reports a missing numbered area, searches nothing and names the cities in that country, the searched one included, with its areas', async () => {
    const r = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add(KARACHI);
      return s.search({ city: ['Lahore'], place: ['DHA Phase 8'] });
    });
    expect(r.total).toBe(0);
    expect(r.locations?.[1]).toMatchObject({
      status: 'unknown',
      suggestions: [expect.objectContaining({ name: 'DHA Phase 5' })],
    });
    expect(r.citiesWithListings?.map((c) => c.name)).toEqual([
      'Lahore',
      'Karachi',
    ]);
    expect(r.unknownPlaceIn).toEqual([
      {
        city: 'Lahore',
        areas: [
          { area: 'Gulberg', city: 'Lahore', count: 3 },
          { area: 'DHA Phase 5', city: 'Lahore', count: 1 },
        ],
        moreAreas: 0,
      },
    ]);
  });

  it('asks which city for a place in two cities, and names the other city when the searched one lacks it', async () => {
    const [both, karachi, lahore] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add(KARACHI);
      return Promise.all([
        s.search({ place: ['DHA'], kind: ['ghar'] }),
        s.search({ city: ['Karachi'], place: ['DHA Phase 5'] }),
        s.search({ place: ['dha phase 5'] }),
      ]);
    });
    expect(both.cityChoice?.options).toEqual(
      expect.arrayContaining([
        { place: 'DHA Phase 5', city: 'Lahore' },
        { place: 'DHA Phase 6', city: 'Karachi' },
      ]),
    );
    expect(both.units).toEqual([]);
    expect(karachi.locations?.[1].elsewhere?.[0]).toMatchObject({
      name: 'DHA Phase 5',
      within: 'Lahore',
    });
    expect(lahore.cityChoice).toBeUndefined();
    expect(units(lahore)).toEqual(['House 214']);
  });

  it('searches a bedroom range and leaves cheque terms out of the filters', async () => {
    const [range, cheques] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({ place: ['Dubai Marina'], minBedrooms: 2, maxBedrooms: 3 }),
        s.search({ city: ['Dubai'], amenities: ['1 or 2 cheques'] }),
      ]);
    });
    expect(units(range)).toEqual(['202']);
    expect(cheques.total).toBe(4);
  });

  it('matches an amenity by its key exactly, never by substring', async () => {
    const [ac, label, parking] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({
          amenities: ['AC'],
          city: ['Dubai', 'Lahore'],
          type: 'RENT',
        }),
        s.search({
          amenities: ['air conditioning'],
          city: ['Dubai', 'Lahore'],
          type: 'RENT',
        }),
        s.search({ amenities: ['parking'], city: ['Lahore'] }),
      ]);
    });
    expect(units(ac).sort()).toEqual(['101', '7']);
    expect(units(label).sort()).toEqual(['101', '7']);
    expect(units(parking)).toEqual(['House 214']);
  });

  it('sorts by price taking turns between currencies, the cheapest of each first, and counts each currency', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ sort: 'price_low', type: 'RENT' }),
    );
    expect(r.total).toBe(9);
    expect(r.currencies).toEqual([
      { currency: 'AED', count: 4, min: 3500, max: 19000 },
      { currency: 'PKR', count: 3, min: 65000, max: 180000 },
      { currency: 'USD', count: 2, min: 1500, max: 2100 },
    ]);
    expect(units(r)).toEqual(['1103', '8', '910', '201', '7']);
    expect(r.units[1].asset.name).toBe('Liberty Crest');
    expect(r.units[1].asset.locality.name).toBe('Gulberg');
  });

  it('pages through the currency turns in the same order', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ sort: 'price_low', type: 'RENT', page: 2 }),
    );
    expect(r.offset).toBe(5);
    expect(units(r)).toEqual(['911', '101', 'House 214', '102']);
  });

  it('reads a budget without a currency in the currency of the city searched', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        city: ['Lahore'],
        minBedrooms: 3,
        type: 'SALE',
        maxPrice: 10000000,
      }),
    );
    expect(r.applied?.budgetCurrency).toBe('PKR');
    expect(r.budgetInferred).toBeUndefined();
    expect(units(r)).toEqual(['9']);
  });

  it('compares a budget without a currency with each listing in its own currency', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        minBedrooms: 3,
        type: 'SALE',
        maxPrice: 10000000,
      }),
    );
    expect(units(r).sort()).toEqual(['202', '9']);
    expect(r.budgetInferred).toBeUndefined();
  });

  it('counts listings in other currencies apart from a budget currency', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        maxPrice: 12000,
        budgetCurrency: 'AED',
        budgetPeriod: 'month',
        type: 'RENT',
      }),
    );
    expect(units(r).sort()).toEqual(['101', '1103', '201']);
    expect(r.otherCurrency).toEqual([
      { currency: 'PKR', count: 3 },
      { currency: 'USD', count: 2 },
    ]);
  });

  it('pages five at a time and runs one tally and one page query per search', async () => {
    const [first, second, past, counts] = await seeded(
      dataSource,
      async (m) => {
        const s = await seed(m);
        await s.search({ place: ['Gulberg'] });
        s.reset();
        const a = await s.search({ place: ['Gulberg'] });
        const placed = s.queries();
        s.reset();
        const b = await s.search({ page: 2 });
        const c = await s.search({ page: 4 });
        return [a, b, c, placed] as const;
      },
    );
    expect(first.total).toBe(3);
    expect(counts).toBe(2);
    expect(second).toMatchObject({ total: 11, offset: 5 });
    expect(second.units).toHaveLength(5);
    expect(past.units).toEqual([]);
  });

  it('finds a place added after the cache was cleared', async () => {
    const [before, after] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      const a = await s.search({ place: ['South Congress'] });
      await s.add([
        'Austin',
        'texas',
        'US',
        'South Congress',
        'Zilker Crest Commons',
        [{ unit: '501', price: 1900 }],
      ]);
      await s.invalidate();
      const b = await s.search({ place: ['South Congress'] });
      return [a, b] as const;
    });
    expect(before.total).toBe(0);
    expect(units(after)).toEqual(['501']);
  });

  it('scores place names like Postgres similarity()', async () => {
    const pairs = [
      ['clifon', 'clifton'],
      ['gulbarg', 'gulberg'],
      ['sharja', 'sharjah'],
      ['dubai marina', 'marina dubai'],
      ['muellerton', 'mueller'],
    ];
    const rows: { score: number }[] = await dataSource.query(
      `SELECT similarity(a, b) AS score FROM unnest($1::text[], $2::text[]) AS t(a, b)`,
      [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
    );
    rows.forEach((r, i) =>
      expect(trigramSimilarity(pairs[i][0], pairs[i][1])).toBeCloseTo(
        Number(r.score),
        5,
      ),
    );
  });

  it('reads Arabic script, misspellings, codes and Urdu phrases as the company places', async () => {
    const r = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add(KARACHI);
      await s.add([
        'Karachi',
        'sindh',
        'PK',
        'Clifton',
        'Seaview Crescent',
        [{ unit: 'C-4', price: 150000 }],
      ]);
      await s.add([
        'Dubai',
        'dubai',
        'AE',
        'Business Bay',
        'Qasr Al Noor Tower',
        [{ unit: '1806', price: 15000, bedrooms: 2 }],
      ]);
      const look = (args: Record<string, unknown>) =>
        s.search(args).then((x) => units(x).sort());
      return {
        sharjah: await look({ city: ['الشارقة'] }),
        tower: await look({ place: ['برج قصر النور'] }),
        lahore: await look({ city: ['لاہور میں'], type: 'RENT' }),
        clifon: await look({ place: ['Clifon'] }),
        dxb: await look({ city: ['DXB'], type: 'RENT' }),
        khi: await look({ city: ['KHI'] }),
        gulbarg: await look({ place: ['Gulbarg'] }),
        manglish: await look({ city: ['Sharja'] }),
        marena: await look({ place: ['Dubai Marena'], type: 'RENT' }),
        unknown: (await s.search({ place: ['Mueler Town'] })).locations?.[0],
        none: (await s.search({ place: ['Timbuktu'] })).locations?.[0],
      };
    });
    expect(r.sharjah).toEqual(['1103']);
    expect(r.tower).toEqual(['1806']);
    expect(r.lahore).toEqual(['7', '8', 'House 214']);
    expect(r.clifon).toEqual(['C-4']);
    expect(r.dxb).toEqual(['101', '102', '1806', '201']);
    expect(r.khi).toEqual(['Bungalow 12', 'C-4']);
    expect(r.gulbarg).toEqual(['7', '8', '9']);
    expect(r.manglish).toEqual(['1103']);
    expect(r.marena).toEqual(['201']);
    expect(r.unknown?.status).toBe('unknown');
    expect(r.unknown?.suggestions.map((p) => p.name)).toContain('Mueller');
    expect(r.none).toMatchObject({ status: 'unknown', suggestions: [] });
  });

  it('matches a block inside its area and suggests the area when the block is missing', async () => {
    const [block, missing] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add([
        'Lahore',
        'punjab',
        'PK',
        'Johar Town',
        'Block J Homes',
        [{ unit: 'J-12', price: 90000 }],
      ]);
      return Promise.all([
        s.search({ place: ['Johar Town Block J'] }),
        s.search({ place: ['Johar Town Block K'] }),
      ]);
    });
    expect(units(block)).toEqual(['J-12']);
    expect(missing.total).toBe(0);
    expect(missing.locations?.[0]).toMatchObject({
      status: 'unknown',
      suggestions: [expect.objectContaining({ name: 'Johar Town' })],
    });
  });

  it('finds a unit by its number inside a building', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ place: ['Block D Homes'], unit: 'house-214' }),
    );
    expect(units(r)).toEqual(['House 214']);
  });

  const palm = [
    'Dubai',
    'dubai',
    'AE',
    'Palm Jumeirah',
    'Shoreline Crest',
    [
      { unit: 'PH 1', price: 40000, kind: 'PENTHOUSE', bedrooms: 4 },
      {
        unit: 'PH 2',
        price: 9000000,
        type: 'FOR_SALE',
        kind: 'PENTHOUSE',
        bedrooms: 4,
        amenities: ['sea_view', 'private_pool'],
      },
      { unit: 'Office 3', price: 25000, kind: 'OFFICE_SPACE', bedrooms: 0 },
    ],
  ] as [string, string, string, string, string, Listing[]];

  it('filters by property kind and reads a kind sent as a place as the kind', async () => {
    const [penthouse, office, asPlace] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add(palm);
      return Promise.all([
        s.search({ city: ['Dubai'], kind: ['penthouse'] }),
        s.search({ kind: ['office'] }),
        s.search({ city: ['Dubai'], place: ['penthouses'] }),
      ]);
    });
    expect(units(penthouse).sort()).toEqual(['PH 1', 'PH 2']);
    expect(units(office)).toEqual(['Office 3']);
    expect(units(asPlace).sort()).toEqual(['PH 1', 'PH 2']);
    expect(asPlace.routed).toEqual([
      'Place 1 was searched as the property kind Penthouse, not as a place.',
    ]);
  });

  it('searches rent and sale together when no type is given', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ place: ['Dubai Marina'] }),
    );
    expect(units(r).sort()).toEqual(['201', '202']);
  });

  it('reads a stored amenity sent as a place, alone or after a place, as the amenity', async () => {
    const [alone, after, missing] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add(palm);
      return Promise.all([
        s.search({ city: ['Dubai'], place: ['sea view'] }),
        s.search({ place: ['Palm Jumeirah private pool'] }),
        s.search({ place: ['bbq area'] }),
      ]);
    });
    expect(units(alone)).toEqual(['PH 2']);
    expect(units(after)).toEqual(['PH 2']);
    expect(after.routed).toEqual([
      'Part of place 1 was searched as the amenity Private pool.',
    ]);
    expect(missing.routed).toBeUndefined();
    expect(missing.total).toBe(0);
  });

  it('finds a unit written before its building and a city by its short form', async () => {
    const [unitFirst, short] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({ place: ['House 214 Block D Homes'] }),
        s.search({ city: ['lhr'] }),
      ]);
    });
    expect(units(unitFirst)).toEqual(['House 214']);
    expect(units(short).sort()).toEqual(['7', '8', '9', 'House 214']);
  });

  it('keeps an exact bedroom count exact', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ bedrooms: 3 }),
    );
    expect(units(r).sort()).toEqual(['202', '9']);
  });

  it('applies a yearly Arabic budget and never returns a listing over it', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        maxPrice: '١٥٠ ألف',
        budgetCurrency: 'AED',
        budgetPeriod: 'year',
        type: 'RENT',
      }),
    );
    expect(units(r).sort()).toEqual(['101', '1103', '201']);
  });

  const houses = [
    'Lahore',
    'punjab',
    'PK',
    'Model Town',
    'Block H Garden Homes',
    [
      {
        unit: 'House 88',
        price: 90000000,
        type: 'FOR_SALE',
        kind: 'VILLA',
        bedrooms: 5,
      },
      {
        unit: 'House 61',
        price: 70000000,
        type: 'FOR_SALE',
        kind: 'TOWNHOUSE',
        bedrooms: 4,
      },
      { unit: 'Flat 3', price: 20000000, type: 'FOR_SALE', bedrooms: 2 },
    ],
  ] as [string, string, string, string, string, Listing[]];

  it('reads house words and a kanal house as villas and townhouses', async () => {
    const [kanal, house] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add(houses);
      return Promise.all([
        s.search({ city: ['Lahore'], place: ['Kanal House'], type: 'SALE' }),
        s.search({ city: ['Lahore'], kind: ['house'], type: 'SALE' }),
      ]);
    });
    expect(units(kanal).sort()).toEqual(['House 61', 'House 88']);
    expect(units(house).sort()).toEqual(['House 61', 'House 88']);
  });

  it('finds a unit written after its building', async () => {
    const [bare, worded] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({ place: ['Azure Quay 201'] }),
        s.search({ place: ['Block D Homes House 214'] }),
      ]);
    });
    expect(units(bare)).toEqual(['201']);
    expect(units(worded)).toEqual(['House 214']);
  });

  it('compares a rental budget without a period with the monthly rent', async () => {
    const r = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add([
        'Dubai',
        'dubai',
        'AE',
        'Marina Walk',
        'Marina Gate',
        [{ unit: '2307', price: 15000, bedrooms: 2 }],
      ]);
      return s.search({
        city: ['Dubai'],
        budgetText: '12k',
        budgetCurrency: 'AED',
        type: 'RENT',
      });
    });
    expect(units(r).sort()).toEqual(['101', '201']);
  });

  it('asks for a city when only an amenity was given, naming only the cities that have it', async () => {
    const [direct, asPlace, single] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({ amenities: ['AC'] }),
        s.search({ place: ['AC'] }),
        s.search({ amenities: ['terrace'] }),
      ]);
    });
    expect(direct).toMatchObject({ cityNeeded: true, total: 0, units: [] });
    expect(direct.citiesWithListings).toEqual([
      { name: 'Dubai', count: 1 },
      { name: 'Lahore', count: 1 },
    ]);
    expect(asPlace.cityNeeded).toBe(true);
    expect(single.cityNeeded).toBeUndefined();
    expect(units(single)).toEqual(['201']);
  });

  it('finds a unit by its number alone, after a kind word, or after an area or city, in every building that has it', async () => {
    const [bare, worded, area, city, both] = await seeded(
      dataSource,
      async (m) => {
        const s = await seed(m);
        await s.add([
          'Sharjah',
          'sharjah',
          'AE',
          'Al Majaz',
          'Majaz Waterfront',
          [{ unit: '201', price: 4500 }],
        ]);
        return Promise.all([
          s.search({ unit: '214' }),
          s.search({ place: ['House 9'] }),
          s.search({ place: ['Gulberg 9'] }),
          s.search({ place: ['Lahore House 214'] }),
          s.search({ place: ['201'] }),
        ]);
      },
    );
    expect(units(bare)).toEqual(['House 214']);
    expect(units(worded)).toEqual(['9']);
    expect(units(area)).toEqual(['9']);
    expect(units(city)).toEqual(['House 214']);
    expect(both.units.map((u) => u.asset.name).sort()).toEqual([
      'Azure Quay',
      'Majaz Waterfront',
    ]);
  });

  it('separates a building named inside the unit value and keeps a place sent as the unit a place', async () => {
    const [inUnit, sector] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      await s.add([
        'Islamabad',
        'islamabad',
        'PK',
        'E-11',
        'Margalla Breeze',
        [{ unit: '603', price: 120000 }],
      ]);
      return Promise.all([
        s.search({ place: ['Dubai Marina'], unit: 'Azure Quay 201' }),
        s.search({ unit: 'E-11' }),
      ]);
    });
    expect(units(inUnit)).toEqual(['201']);
    expect(units(sector)).toEqual(['603']);
  });

  it('reads Arabic and Urdu script names as the stored Latin places', async () => {
    const [urdu, building] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({ city: ['لاہور'], type: 'RENT' }),
        s.search({ place: ['أزور كواي'] }),
      ]);
    });
    expect(units(urdu).sort()).toEqual(['7', '8', 'House 214']);
    expect(units(building).sort()).toEqual(['201', '202']);
  });

  it('reads a budget without a currency in the currency of the searched place', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        place: ['Dubai Marina'],
        maxPrice: 12000,
        budgetPeriod: 'month',
      }),
    );
    expect(r.applied?.budgetCurrency).toBe('AED');
    expect(units(r)).toEqual(['201']);
  });

  it('suggests no place in another country than the one the search names', async () => {
    const [named, open] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({
          place: ['Mueler Town'],
          maxPrice: 5000,
          budgetCurrency: 'AED',
        }),
        s.search({ place: ['Mueler Town'] }),
      ]);
    });
    expect(named.locations?.[0]).toMatchObject({
      status: 'unknown',
      suggestions: [],
    });
    expect(open.locations?.[0].suggestions.map((p) => p.name)).toContain(
      'Mueller',
    );
  });

  it('matches only the company places: a city it has no listings in is unknown', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ city: ['Riyadh'] }),
    );
    expect(r.total).toBe(0);
    expect(r.locations?.[0]).toMatchObject({ status: 'unknown' });
  });

  it('names only cities that hold the asked kind and budget after an empty search', async () => {
    const [budget, kind] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return Promise.all([
        s.search({
          city: ['Dubai'],
          maxPrice: 4000,
          budgetCurrency: 'AED',
          budgetPeriod: 'month',
        }),
        s.search({ city: ['Dubai'], kind: ['office'] }),
      ]);
    });
    expect(budget.citiesWithListings).toEqual([{ name: 'Sharjah', count: 1 }]);
    expect(kind.citiesWithListings).toEqual([]);
  });

  it('lists the searched city and its areas for an unknown word sent as a place', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({ city: ['Dubai'], place: ['Binaya'] }),
    );
    expect(r.total).toBe(0);
    expect(r.citiesWithListings?.[0]).toEqual({ name: 'Dubai', count: 4 });
    expect(r.unknownPlaceIn?.[0].city).toBe('Dubai');
    expect(r.unknownPlaceIn?.[0].areas.map((a) => a.area).sort()).toEqual([
      'Downtown',
      'Dubai Marina',
    ]);
  });

  it('looks a unit up without the offer the customer made as a budget', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        unit: '7',
        place: ['Gulberg'],
        maxPrice: 80000,
      }),
    );
    expect(units(r)).toEqual(['7']);
    expect(r.unitWithoutBudget).toBe(true);
    expect(r.applied?.maxPrice).toBeUndefined();
  });

  it('reads 1 arab as a billion and finds every house under it', async () => {
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search({
        city: ['Lahore'],
        type: 'SALE',
        maxPrice: '1 arab',
      }),
    );
    expect(units(r)).toEqual(['9']);
  });

  it('looks a unit up in its own city and currency when asked in another', async () => {
    const args = { unit: '201', city: ['Pakistan'], budgetCurrency: 'PKR' };
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search(args),
    );
    expect(units(r)).toEqual(['201']);
    expect(r.unitElsewhere).toBe(true);
    const text = formatSearchResult(r, parseSearchArgs(args), 'AED');
    expect(text).toContain('Price: AED 10,000 per month');
    expect(text).toContain('never converted to PKR');
  });

  it('reads a rental budget without a currency or period in each listing currency and its closer period', async () => {
    const args = { bedrooms: 1, maxPrice: 8000, type: 'RENT' };
    const r = await seeded(dataSource, async (m) =>
      (await seed(m)).search(args),
    );
    expect(units(r).sort()).toEqual(['1103']);
    const text = formatSearchResult(r, parseSearchArgs(args), 'AED');
    expect(text.split('\n')[0]).toBe('Found 1 property.');
  });

  it('counts what a kind or amenity filter alone left out of an empty search', async () => {
    const [kind, amenity] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return [
        await s.search({ city: ['Dubai'], kind: ['villa'] }),
        await s.search({ city: ['Lahore'], amenities: ['pool'] }),
      ];
    });
    expect(kind.total).toBe(0);
    expect(kind.unfiltered).toBe(4);
    expect(amenity.unfiltered).toBe(4);
    expect(
      formatSearchResult(kind, parseSearchArgs({ kind: ['villa'] }), 'AED'),
    ).toContain('Filters applied: kind Villa');
  });

  it('reads dedh crore and paune 1 crore against sale prices', async () => {
    const [dedh, paune] = await seeded(dataSource, async (m) => {
      const s = await seed(m);
      return [
        await s.search({
          city: ['Lahore'],
          type: 'SALE',
          maxPrice: 'dedh crore',
        }),
        await s.search({
          city: ['Lahore'],
          type: 'SALE',
          maxPrice: 'paune 1 crore',
        }),
      ];
    });
    expect(units(dedh)).toEqual(['9']);
    expect(paune.total).toBe(0);
  });

  it('returns the listings for code to render as cards in the reply language', async () => {
    const result = await seeded(dataSource, async (m) =>
      (await seed(m)).run({ city: ['Sharjah'], type: 'RENT' }),
    );
    const cards = renderCards(result.listings ?? [], 'AED', 'ur-Latn');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      unitNumber: '1103',
      building: 'Nahda View',
      city: 'Sharjah',
    });
    expect(cards[0].text.split('\n')).toEqual([
      '1) Nahda View, unit 1103',
      'Kiraye ke liye',
      'Qeemat: AED 3,500 mahana',
      'Salana: AED 42,000',
      'Jagah: Al Nahda, Sharjah',
      'Bedroom: 1',
    ]);
  });

  it('reads the budget the customer wrote, in words and any script, with no period question', async () => {
    const [sharjah, sawa, lakh70, yearly] = await seeded(
      dataSource,
      async (m) => {
        const s = await seed(m);
        return [
          await s.run({
            city: ['Sharjah'],
            bedrooms: 1,
            budgetText: 'under 4000 AED a month',
          }),
          await s.run({
            city: ['Lahore'],
            type: 'RENT',
            budgetText: 'بجٹ سوا لاکھ تک ماہانہ',
          }),
          await s.run({
            city: ['Lahore'],
            type: 'RENT',
            budgetText: '1 lakh 70 tak mahana',
          }),
          await s.run({ city: ['Dubai'], type: 'RENT', budgetText: '120k' }),
        ];
      },
    );
    const numbers = (r: { listings?: { unit: Unit }[] }) =>
      (r.listings ?? []).map((l) => l.unit.unitNumber).sort();
    expect(numbers(sharjah)).toEqual(['1103']);
    expect(numbers(sawa)).toEqual(['7', '8']);
    expect(numbers(lakh70)).toEqual(['7', '8']);
    expect(numbers(yearly)).toEqual(['201']);
    expect(yearly.text).not.toContain('per month or per year');
    expect(yearly.text).toContain(
      'each rental was compared with its monthly rent or its yearly figure',
    );
  });
});
