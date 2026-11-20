import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectTestDatabase } from './test-data-source';
import { seedCompany } from './harness';
import { Company } from '../../src/modules/companies/entities/company.entity';
import { Asset } from '../../src/modules/properties/entities/asset.entity';
import { Unit } from '../../src/modules/properties/entities/unit.entity';
import { Locality } from '../../src/modules/locations/entities/locality.entity';
import {
  OWNER_NOT_FOUND_REASON,
  UnitsImportService,
} from '../../src/modules/data-transfer/units-import.service';
import { UNIT_COLUMNS } from '../../src/modules/properties/transfer/unit.columns';

jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn().mockResolvedValue(undefined),
}));

const HEADERS = UNIT_COLUMNS.map((column) => column.header).join(',');

class FailingInsert extends UnitsImportService {
  protected async insert(
    ...args: Parameters<UnitsImportService['insert']>
  ): Promise<Unit[]> {
    await super.insert(...args);
    throw new Error('insert failed on purpose');
  }
}

// The company lock, the transaction and the catalogue dedupe only prove themselves against a real database.
describe('units import against a real database', () => {
  let dataSource: DataSource;
  let dir: string;
  let companyId: string;
  let cityId: string;
  let cityName: string;
  let localityName: string;
  let assetName: string;
  const userId = randomUUID();
  const log = jest.fn();
  const redis = { forget: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
    dir = await mkdtemp(join(tmpdir(), 'unit-import-db-'));
    const company = await seedCompany(dataSource.manager, 'Unit Import Co', [
      'makkah',
    ]);
    companyId = company.id;
    const suffix = Math.random().toString(36).slice(2, 10);
    cityName = `City ${suffix}`;
    localityName = `Locality ${suffix}`;
    assetName = `Asset ${suffix}`;
    const city: { id: string }[] = await dataSource.manager.query(
      `INSERT INTO "cities" ("name", "region_code", "country", "created_by_company_id")
       VALUES ($1, 'makkah', 'SA', $2) RETURNING id`,
      [cityName, companyId],
    );
    cityId = city[0].id;
    const locality: { id: string }[] = await dataSource.manager.query(
      `INSERT INTO "localities" ("name", "city_id", "created_by_company_id")
       VALUES ($1, $2, $3) RETURNING id`,
      [localityName, cityId, companyId],
    );
    await dataSource.manager.query(
      `INSERT INTO "assets" ("name", "locality_id", "company_id")
       VALUES ($1, $2, $3)`,
      [assetName, locality[0].id, companyId],
    );
    await dataSource.manager.query(
      `INSERT INTO "contacts" ("company_id", "first_name", "phone", "region_code")
       VALUES ($1, 'Sara', '+966501234567', 'makkah')`,
      [companyId],
    );
  });

  afterAll(async () => {
    if (dataSource && companyId) {
      await dataSource.manager.query(
        'DELETE FROM "units" WHERE "company_id" = $1',
        [companyId],
      );
      await dataSource.manager.query(
        'DELETE FROM "assets" WHERE "company_id" = $1',
        [companyId],
      );
      await dataSource.manager.query(
        'DELETE FROM "contacts" WHERE "company_id" = $1',
        [companyId],
      );
      // Localities cascade from their city.
      await dataSource.manager.query('DELETE FROM "cities" WHERE "id" = $1', [
        cityId,
      ]);
      await dataSource.manager.delete(Company, { id: companyId });
    }
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    log.mockReset();
    redis.forget.mockClear();
    await dataSource.manager.query(
      'DELETE FROM "units" WHERE "company_id" = $1',
      [companyId],
    );
  });

  function service(Klass = UnitsImportService) {
    return new Klass(
      dataSource.getRepository(Company),
      dataSource,
      { log } as never,
      redis as never,
    );
  }

  function row(cells: Record<string, string>): string {
    const values: Record<string, string> = {
      city: cityName,
      locality: localityName,
      asset: assetName,
      subType: 'APARTMENT',
      ...cells,
    };
    return UNIT_COLUMNS.map((column) => {
      const value = values[column.key] ?? '';
      return /[",;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(',');
  }

  async function file(name: string, lines: string[]) {
    const path = join(dir, `${randomUUID()}-${name}`);
    await writeFile(path, [HEADERS, ...lines].join('\r\n'), 'utf8');
    return {
      path,
      originalname: name,
      mimetype: 'text/csv',
    } as Express.Multer.File;
  }

  const user = () => ({
    userId,
    email: 'admin@example.com',
    companyId,
    role: 'company_admin',
    regionCodes: ['makkah'],
  });

  function count(manager: EntityManager = dataSource.manager) {
    return manager.count(Unit, { where: { companyId } });
  }

  function two(suffix = '') {
    return [
      row({
        unitNumber: `101${suffix}`,
        price: '85000',
        bathrooms: '2.5',
        amenities: 'gym;pool',
        ownerPhone: '0501234567',
      }),
      row({ unitNumber: `102${suffix}`, status: 'rented' }),
    ];
  }

  it('inserts the add rows with the asset, owner and defaults, and logs counts only', async () => {
    const result = await service().commit(
      await file('two.csv', two()),
      user(),
      companyId,
    );
    expect(result).toMatchObject({
      added: 2,
      skipped: 0,
      failed: 0,
      failedRows: [],
      notes: [],
    });
    const rows = await dataSource.manager.find(Unit, {
      where: { companyId },
      relations: ['asset', 'owner'],
      order: { unitNumber: 'ASC' },
    });
    expect(
      rows.map((u) => [
        u.unitNumber,
        u.asset.name,
        u.owner?.phone ?? null,
        u.status,
        u.subType,
        u.bathrooms,
        u.amenities,
      ]),
    ).toEqual([
      [
        '101',
        assetName,
        '+966501234567',
        'available',
        'APARTMENT',
        2.5,
        ['gym', 'pool'],
      ],
      ['102', assetName, null, 'rented', 'APARTMENT', null, []],
    ]);
    expect(Number(rows[0].price)).toBe(85000);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      companyId,
      userId,
      action: 'IMPORT',
      entityType: 'Unit',
      regionCode: 'makkah',
      newValue: {
        added: 2,
        skipped: 0,
        failed: 0,
        notes: 0,
        fileName: 'two.csv',
      },
    });
    expect(Object.keys(log.mock.calls[0][0].newValue)).toEqual([
      'added',
      'skipped',
      'failed',
      'notes',
      'fileName',
    ]);
    expect(redis.forget).not.toHaveBeenCalled();
  });

  it('returns each unit imported without an owner with its id and locality', async () => {
    const result = await service().commit(
      await file('ownerless.csv', [
        row({
          unitNumber: '201',
          ownerFirstName: 'Only',
          ownerLastName: 'Name',
        }),
        row({ unitNumber: '202', ownerPhone: '0501234567' }),
      ]),
      user(),
      companyId,
    );
    expect(result).toMatchObject({ added: 2, skipped: 0, failed: 0 });
    const unit = await dataSource.manager.findOneOrFail(Unit, {
      where: { companyId, unitNumber: '201' },
      relations: ['asset'],
    });
    expect(unit.ownerId).toBeNull();
    expect(result.notes).toEqual([
      {
        id: unit.id,
        row: 2,
        values: expect.objectContaining({ unitNumber: '201' }),
        reason: OWNER_NOT_FOUND_REASON,
        parentIds: [unit.asset.localityId],
      },
    ]);
    expect(log.mock.calls[0][0].newValue).toMatchObject({ notes: 1 });
  });

  it('skips rows that already exist on a second run, matching the asset and unit number loosely', async () => {
    await service().commit(await file('first.csv', two()), user(), companyId);
    const again = await service().commit(
      await file('again.csv', [
        row({ asset: assetName.toUpperCase(), unitNumber: ' 101 ' }),
        row({ unitNumber: '102' }),
      ]),
      user(),
      companyId,
    );
    expect(again).toMatchObject({
      added: 0,
      skipped: 2,
      failed: 0,
      failedRows: [],
    });
    expect(await count()).toBe(2);
  });

  it('creates a missing locality and asset once, and reuses an asset whose name differs only in case and spacing', async () => {
    const newLocality = `New Locality ${randomUUID().slice(0, 8)}`;
    const newAsset = `New Asset ${randomUUID().slice(0, 8)}`;
    const result = await service().commit(
      await file('places.csv', [
        row({ locality: newLocality, asset: newAsset, unitNumber: '1' }),
        row({ locality: newLocality, asset: newAsset, unitNumber: '2' }),
        row({ asset: `  ${assetName.toUpperCase()}  `, unitNumber: '3' }),
      ]),
      user(),
      companyId,
    );
    expect(result).toMatchObject({ added: 3, skipped: 0, failed: 0 });
    const localities = await dataSource.manager.count(Locality, {
      where: { cityId, name: newLocality },
    });
    expect(localities).toBe(1);
    const assets: { name: string; units: string }[] =
      await dataSource.manager.query(
        `SELECT a."name", COUNT(u.id)::text AS units
           FROM "assets" a LEFT JOIN "units" u ON u."asset_id" = a."id"
          WHERE a."company_id" = $1
          GROUP BY a."name" ORDER BY a."name"`,
        [companyId],
      );
    expect(assets).toEqual([
      { name: assetName, units: '1' },
      { name: newAsset, units: '2' },
    ]);
    expect(redis.forget).toHaveBeenCalled();
  });

  it('fails a city outside the company regions without touching the catalogue', async () => {
    const before = await dataSource.manager.count(Asset, {
      where: { createdByCompanyId: companyId },
    });
    const result = await service().commit(
      await file('city.csv', [
        row({
          city: `Nowhere ${randomUUID().slice(0, 8)}`,
          asset: 'Ghost Tower',
          unitNumber: '1',
        }),
      ]),
      user(),
      companyId,
    );
    expect(result).toMatchObject({ added: 0, skipped: 0, failed: 1 });
    expect(result.failedRows[0]).toMatchObject({
      column: 'City',
      reason: 'City not found.',
    });
    expect(
      await dataSource.manager.count(Asset, {
        where: { createdByCompanyId: companyId },
      }),
    ).toBe(before);
  });

  it('serializes parallel commits of the same file through the company lock', async () => {
    const [a, b] = await Promise.all([
      service().commit(await file('par-a.csv', two()), user(), companyId),
      service().commit(await file('par-b.csv', two()), user(), companyId),
    ]);
    expect([a.added, b.added].sort()).toEqual([0, 2]);
    expect(await count()).toBe(2);
  });

  it('rolls back every unit, locality and asset when a later step in the transaction throws', async () => {
    const newLocality = `Rollback Locality ${randomUUID().slice(0, 8)}`;
    const newAsset = `Rollback Asset ${randomUUID().slice(0, 8)}`;
    await expect(
      service(FailingInsert).commit(
        await file('rollback.csv', [
          ...two(),
          row({ locality: newLocality, asset: newAsset, unitNumber: '9' }),
        ]),
        user(),
        companyId,
      ),
    ).rejects.toThrow('insert failed on purpose');
    expect(await count()).toBe(0);
    expect(
      await dataSource.manager.count(Locality, {
        where: { cityId, name: newLocality },
      }),
    ).toBe(0);
    expect(
      await dataSource.manager.count(Asset, {
        where: { createdByCompanyId: companyId, name: newAsset },
      }),
    ).toBe(0);
    expect(redis.forget).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
