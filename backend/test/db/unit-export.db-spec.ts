import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { connectTestDatabase } from './test-data-source';
import { seedCompany } from './harness';
import { Company } from '../../src/modules/companies/entities/company.entity';
import { Contact } from '../../src/modules/contacts/entities/contact.entity';
import { Asset } from '../../src/modules/properties/entities/asset.entity';
import { Unit } from '../../src/modules/properties/entities/unit.entity';
import { PropertyMedia } from '../../src/modules/properties/entities/property-media.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { ContactAccessRequest } from '../../src/modules/contact-access-requests/entities/contact-access-request.entity';
import { ContactPrivacyService } from '../../src/modules/contacts/contact-privacy.service';
import { PropertiesService } from '../../src/modules/properties/properties.service';
import {
  UnitsExportService,
  EXPORT_LIMITS,
} from '../../src/modules/properties/transfer/units-export.service';
import { ExportUnitsQueryDto } from '../../src/modules/properties/dto/export-units-query.dto';
import { UnitArchivedFilter } from '../../src/modules/properties/dto/unit-archived-filter.enum';

// All rows share one microsecond timestamp across several batches, so the cursor must split ties by id.
const TIED_AT = '2026-11-01 08:00:00.123456+00';
const TOTAL = 2500;

// Keyset order with tied sort keys, the join chain and the region filter only prove themselves against a real database.
describe('units export against a real database', () => {
  let dataSource: DataSource;
  let companyId: string;
  const userId = randomUUID();
  const log = jest.fn();
  const limits = { ...EXPORT_LIMITS };
  const cityIds: string[] = [];

  async function seedChain(regionCode: string, suffix: string) {
    const city: { id: string }[] = await dataSource.manager.query(
      `INSERT INTO "cities" ("name", "region_code", "country", "created_by_company_id")
       VALUES ($1, $2, 'SA', $3) RETURNING id`,
      [`City ${suffix}`, regionCode, companyId],
    );
    cityIds.push(city[0].id);
    const locality: { id: string }[] = await dataSource.manager.query(
      `INSERT INTO "localities" ("name", "city_id", "created_by_company_id")
       VALUES ($1, $2, $3) RETURNING id`,
      [`Locality ${suffix}`, city[0].id, companyId],
    );
    const asset: { id: string }[] = await dataSource.manager.query(
      `INSERT INTO "assets" ("name", "locality_id", "company_id")
       VALUES ($1, $2, $3) RETURNING id`,
      [`Asset ${suffix}`, locality[0].id, companyId],
    );
    return asset[0].id;
  }

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
    const company = await seedCompany(dataSource.manager, 'Unit Export Co', [
      'makkah',
      'punjab',
    ]);
    companyId = company.id;
    await dataSource.manager.query(
      `UPDATE "companies" SET "subscription_tier" = 'PRO' WHERE "id" = $1`,
      [companyId],
    );
    const suffix = Math.random().toString(36).slice(2, 10);
    const makkahAsset = await seedChain('makkah', `m-${suffix}`);
    const punjabAsset = await seedChain('punjab', `p-${suffix}`);
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const assetId = i % 5 === 0 ? punjabAsset : makkahAsset;
      params.push(
        `U-${i}`,
        assetId,
        companyId,
        i % 2 === 0 ? 'rented' : 'available',
        TIED_AT,
      );
      const base = i * 5;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, 'APARTMENT', $${base + 4}, $${base + 5}::timestamptz)`,
      );
    }
    await dataSource.manager.query(
      `INSERT INTO "units" ("unit_number", "asset_id", "company_id", "sub_type", "status", "created_at")
       VALUES ${values.join(',')}`,
      params,
    );
  });

  afterAll(async () => {
    Object.assign(EXPORT_LIMITS, limits);
    if (dataSource && companyId) {
      await dataSource.manager.query(
        'DELETE FROM "units" WHERE "company_id" = $1',
        [companyId],
      );
      await dataSource.manager.query(
        'DELETE FROM "assets" WHERE "company_id" = $1',
        [companyId],
      );
      // Localities cascade from their city.
      for (const cityId of cityIds) {
        await dataSource.manager.query('DELETE FROM "cities" WHERE "id" = $1', [
          cityId,
        ]);
      }
      await dataSource.manager.delete(Company, { id: companyId });
    }
    await dataSource?.destroy();
  });

  beforeEach(() => {
    log.mockReset();
    Object.assign(EXPORT_LIMITS, limits);
  });

  function service() {
    const privacy = new ContactPrivacyService(
      dataSource.getRepository(ContactAccessRequest),
      dataSource.getRepository(User),
      null as never,
    );
    const properties = new PropertiesService(
      dataSource.getRepository(Asset),
      dataSource.getRepository(Unit),
      dataSource.getRepository(PropertyMedia),
      dataSource.getRepository(Contact),
      null as never,
      dataSource,
      null as never,
      null as never,
      null as never,
      privacy,
      null as never,
    );
    return new UnitsExportService(
      dataSource.getRepository(Company),
      properties,
      privacy,
      { log } as never,
    );
  }

  const viewer = () => ({
    userId,
    role: 'company_admin',
    regionCodes: ['makkah', 'punjab'],
  });

  function query(overrides: Partial<ExportUnitsQueryDto> = {}) {
    return Object.assign(new ExportUnitsQueryDto(), overrides);
  }

  function rows(buffer: Buffer): string[][] {
    return buffer
      .toString('utf8')
      .replace(/^﻿/, '')
      .trim()
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(','));
  }

  it('walks 2,500 rows that share one microsecond created_at across batches without a gap or a repeat', async () => {
    const result = await service().export(companyId, viewer(), query());
    const seen = rows(result.buffer);
    expect(result.rows).toBe(TOTAL);
    expect(result.truncated).toBe(false);
    expect(new Set(seen.map((cells) => cells[3])).size).toBe(TOTAL);
    // The join chain fills the text columns on every row.
    expect(seen.every((cells) => cells[0].startsWith('City '))).toBe(true);
    expect(seen.every((cells) => cells[2].startsWith('Asset '))).toBe(true);
  });

  it('applies the list filters: region through the city and status on the unit', async () => {
    const scoped = await service().export(
      companyId,
      viewer(),
      query({ regionCode: 'punjab' }),
    );
    expect(scoped.rows).toBe(TOTAL / 5);
    expect(scoped.fileName).toMatch(/^units-punjab-/);
    const rented = await service().export(
      companyId,
      viewer(),
      query({
        status: 'rented' as never,
        archived: UnitArchivedFilter.INCLUDE,
      }),
    );
    expect(rented.rows).toBe(TOTAL / 2);
    expect(rented.fileName).toMatch(/^units-all-/);
  });

  it('stops at the cap and says so, with one EXPORT audit row per export', async () => {
    Object.assign(EXPORT_LIMITS, { batch: 700, cap: 2000 });
    const result = await service().export(companyId, viewer(), query());
    expect(result.rows).toBe(2000);
    expect(result.truncated).toBe(true);
    expect(new Set(rows(result.buffer).map((cells) => cells[3])).size).toBe(
      2000,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      companyId,
      userId,
      action: 'EXPORT',
      entityType: 'Unit',
      regionCode: null,
      newValue: { rows: 2000, truncated: true, filters: {} },
    });
  });
});
