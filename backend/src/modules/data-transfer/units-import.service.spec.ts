import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileTypeFromFile } from 'file-type';
import {
  OWNER_NOT_FOUND_REASON,
  PLACE_TAKEN_MESSAGE,
  UnitsImportService,
} from './units-import.service';
import { Asset } from '../properties/entities/asset.entity';
import { Locality } from '../locations/entities/locality.entity';
import { Unit } from '../properties/entities/unit.entity';
import { UNIT_COLUMNS } from '../properties/transfer/unit.columns';

const HEADERS = UNIT_COLUMNS.map((column) => column.header).join(',');

const USER = {
  userId: 'user-uuid-1',
  email: 'admin@example.com',
  companyId: 'company-uuid-1',
  role: 'company_admin',
  regionCodes: ['makkah'],
};

const CITY = '11111111-1111-4111-8111-111111111111';
const LOCALITY = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';

interface Cells {
  city?: string;
  locality?: string;
  asset?: string;
  unitNumber?: string;
  subType?: string;
  status?: string;
  propertyType?: string;
  price?: string;
  sqFt?: string;
  bedrooms?: string;
  bathrooms?: string;
  floor?: string;
  amenities?: string;
  description?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
}

// One CSV line in template column order; blanks stay blank.
function row(cells: Cells): string {
  const values: Cells = {
    city: 'Riyadh',
    locality: 'Al Olaya',
    asset: 'Olaya Towers',
    unitNumber: '1204',
    subType: 'APARTMENT',
    ...cells,
  };
  return UNIT_COLUMNS.map((column) => {
    const value = values[column.key as keyof Cells] ?? '';
    return /[",;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(',');
}

describe('UnitsImportService', () => {
  let dir: string;
  let service: UnitsImportService;
  let regions: string[];
  let cities: { id: string; key: string }[];
  let localities: { id: string; parent: string; key: string }[];
  let assets: { id: string; parent: string; key: string }[];
  let units: { asset_id: string; key: string }[];
  let phones: { id: string; digits: string }[];
  let emails: { id: string; email: string }[];
  const query = jest.fn();
  const save = jest.fn();
  const saveLocalities = jest.fn();
  const saveAssets = jest.fn();
  const log = jest.fn();
  const forget = jest.fn();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'units-import-'));
  });

  beforeEach(() => {
    regions = ['makkah'];
    cities = [{ id: CITY, key: 'riyadh' }];
    localities = [{ id: LOCALITY, parent: CITY, key: 'al olaya' }];
    assets = [{ id: ASSET, parent: LOCALITY, key: 'olaya towers' }];
    units = [];
    phones = [];
    emails = [];
    query.mockReset();
    query.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([]);
      if (sql.includes('FROM "cities"')) return Promise.resolve(cities);
      if (sql.includes('FROM "localities"')) return Promise.resolve(localities);
      if (sql.includes('FROM "assets"')) return Promise.resolve(assets);
      if (sql.includes('FROM "units"')) return Promise.resolve(units);
      if (sql.includes('"phone"')) return Promise.resolve(phones);
      if (sql.includes('"email"')) return Promise.resolve(emails);
      return Promise.resolve([]);
    });
    save.mockReset();
    save.mockImplementation((entities: Record<string, unknown>[]) =>
      Promise.resolve(
        entities.map((entity, index) => ({
          ...entity,
          id: `unit-${index + 1}`,
        })),
      ),
    );
    saveLocalities.mockReset();
    saveLocalities.mockImplementation((entities: { name: string }[]) =>
      Promise.resolve(
        entities.map((entity) => ({
          ...entity,
          id: `new-locality:${entity.name}`,
        })),
      ),
    );
    saveAssets.mockReset();
    saveAssets.mockImplementation((entities: { name: string }[]) =>
      Promise.resolve(
        entities.map((entity) => ({
          ...entity,
          id: `new-asset:${entity.name}`,
        })),
      ),
    );
    log.mockReset();
    forget.mockReset();
    (fileTypeFromFile as jest.Mock).mockResolvedValue(undefined);
    const companyRepository = {
      findOne: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ id: 'company-uuid-1', activeRegions: regions }),
        ),
    };
    const repositories = new Map<unknown, jest.Mock>([
      [Unit, save],
      [Locality, saveLocalities],
      [Asset, saveAssets],
    ]);
    const manager = {
      query,
      getRepository: (entity: unknown) => ({
        create: (plain: unknown) => plain,
        save: repositories.get(entity),
      }),
    };
    const dataSource = {
      manager,
      transaction: (work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
    };
    service = new UnitsImportService(
      companyRepository as never,
      dataSource as never,
      { log } as never,
      { forget } as never,
    );
  });

  async function upload(name: string, lines: string[], headers = HEADERS) {
    const path = join(dir, `${Date.now()}-${Math.random()}-${name}`);
    await writeFile(path, [headers, ...lines].join('\r\n'), 'utf8');
    return {
      path,
      originalname: name,
      mimetype: 'text/csv',
    } as Express.Multer.File;
  }

  function preview(file: Express.Multer.File) {
    return service.preview(file, USER, 'company-uuid-1');
  }

  function commit(file: Express.Multer.File) {
    return service.commit(file, USER, 'company-uuid-1');
  }

  describe('cells', () => {
    it('adds a full row, reading enums in any case and numbers as numbers', async () => {
      const plan = await preview(
        await upload('ok.csv', [
          row({
            subType: 'apartment',
            status: 'Rented',
            propertyType: 'for sale',
            price: '85,000',
            sqFt: '1450.5',
            bedrooms: '2',
            bathrooms: '2.5',
            floor: '12',
            amenities: 'gym; Covered_Parking;',
            description: 'Corner unit',
          }),
        ]),
      );
      expect(plan).toMatchObject({ willAdd: 1, willSkip: 0, failed: 0 });
      expect(plan.rows).toEqual([{ row: 2, status: 'add' }]);
    });

    it('names the required column when a cell is blank', async () => {
      const plan = await preview(
        await upload('required.csv', [
          row({ subType: '' }),
          row({ unitNumber: '' }),
          row({ locality: '' }),
        ]),
      );
      expect(plan.failed).toBe(3);
      expect(plan.rows.map((r) => [r.column, r.reason])).toEqual([
        ['Sub Type', 'This cell is required.'],
        ['Unit Number', 'This cell is required.'],
        ['Locality', 'This cell is required.'],
      ]);
    });

    it('turns bad enums, numbers, amenities and limits into row errors with plain words', async () => {
      const plan = await preview(
        await upload('cells.csv', [
          row({ subType: 'FLAT' }),
          row({ status: 'open' }),
          row({ propertyType: 'LEASE' }),
          row({ price: 'cheap' }),
          row({ bedrooms: '2.5' }),
          row({ bathrooms: '2.3' }),
          row({ bathrooms: '100' }),
          row({ amenities: 'gym;helipad' }),
          row({ floor: 'x'.repeat(21) }),
          row({ ownerEmail: 'not-an-email' }),
        ]),
      );
      expect(plan.failed).toBe(10);
      expect(plan.rows.map((r) => [r.column, r.reason])).toEqual([
        [
          'Sub Type',
          'Use one of: APARTMENT, VILLA, TOWNHOUSE, PENTHOUSE, OFFICE_SPACE, RETAIL_STORE, WAREHOUSE, LAND_PLOT.',
        ],
        ['Status', 'Use one of: available, rented, sold, maintenance.'],
        ['Listing Type', 'Use one of: RENTAL, FOR_SALE.'],
        ['Price', 'Enter a number.'],
        ['Bedrooms', 'Enter a whole number.'],
        ['Bathrooms', 'Use a whole or half number, such as 2 or 2.5.'],
        ['Bathrooms', 'Enter 99 or less.'],
        ['Amenities', 'Unknown amenity "helipad".'],
        ['Floor', 'Use at most 20 characters.'],
        ['Owner Email', 'Enter a valid email address.'],
      ]);
      expect(plan.rows[0].values).toMatchObject({ subType: 'FLAT' });
    });

    it('reports an unknown header as a file error and ignores Created At', async () => {
      const bad = await preview(
        await upload('bad-header.csv', ['Riyadh,x'], 'City,Tower'),
      );
      expect(bad.rows).toEqual([]);
      expect(bad.fileErrors[0]).toMatchObject({
        code: 'UNKNOWN_HEADER',
        header: 'Tower',
      });
      const exported = await preview(
        await upload(
          'exported.csv',
          ['Riyadh,Al Olaya,Olaya Towers,1204,APARTMENT,2026-01-01 10:00'],
          'City,Locality,Asset,Unit Number,Sub Type,Created At',
        ),
      );
      expect(exported.fileErrors).toEqual([]);
      expect(exported.rows[0]).toMatchObject({ row: 2, status: 'add' });
    });

    it('treats an owner with a name but no phone or email as not found, never as an error', async () => {
      const plan = await preview(
        await upload('owner-name-only.csv', [row({ ownerFirstName: 'Sara' })]),
      );
      expect(plan).toMatchObject({ willAdd: 1, willSkip: 0, failed: 0 });
      expect(plan.rows[0]).toMatchObject({
        status: 'add',
        reason: OWNER_NOT_FOUND_REASON,
      });
      expect(plan.rows[0].column).toBeUndefined();
    });
  });

  describe('duplicates and places', () => {
    it('skips an in-file duplicate of asset plus unit number, any case, first occurrence wins', async () => {
      const plan = await preview(
        await upload('dup.csv', [
          row({ unitNumber: '1204' }),
          row({ asset: 'olaya  towers', unitNumber: ' 1204 ' }),
          row({ asset: 'Other Tower', unitNumber: '1204' }),
        ]),
      );
      expect(plan).toMatchObject({ willAdd: 2, willSkip: 1 });
      expect(plan.rows[1]).toMatchObject({
        row: 3,
        status: 'skip',
        reason: 'Duplicate of row 2',
      });
    });

    it('round-trips an unchanged export: every row skips, whatever its owner cells hold', async () => {
      units = [
        { asset_id: ASSET, key: '1204' },
        { asset_id: ASSET, key: '1205' },
        { asset_id: ASSET, key: '1206' },
      ];
      const plan = await preview(
        await upload('export.csv', [
          row({ unitNumber: '1204', ownerFirstName: 'Sara' }),
          row({ unitNumber: '1205', ownerLastName: 'Al Mansoori' }),
          row({ unitNumber: '1206' }),
        ]),
      );
      expect(plan).toMatchObject({ willAdd: 0, willSkip: 3, failed: 0 });
      expect(plan.rows.map((planned) => planned.status)).toEqual([
        'skip',
        'skip',
        'skip',
      ]);
      expect(
        query.mock.calls.some(([sql]) =>
          (sql as string).includes('FROM "contacts"'),
        ),
      ).toBe(false);
    });

    it('skips a unit that already exists on the asset and names the asset', async () => {
      units = [{ asset_id: ASSET, key: '1204' }];
      const plan = await preview(
        await upload('db-dup.csv', [
          row({ unitNumber: '1204' }),
          row({ unitNumber: '1205' }),
        ]),
      );
      expect(plan).toMatchObject({ willAdd: 1, willSkip: 1 });
      expect(plan.rows[0]).toMatchObject({
        status: 'skip',
        reason: 'Already exists in Olaya Towers',
      });
      const unitsCall = query.mock.calls.find(([sql]) =>
        (sql as string).includes('FROM "units"'),
      );
      expect(unitsCall?.[1]).toEqual([
        'company-uuid-1',
        [ASSET],
        ['1204', '1205'],
      ]);
    });

    it('fails a city that is not in the company regions and one that is in several', async () => {
      cities = [
        { id: CITY, key: 'riyadh' },
        { id: 'other-city', key: 'riyadh' },
      ];
      const plan = await preview(
        await upload('cities.csv', [
          row({ city: 'Jeddah' }),
          row({ city: 'Riyadh' }),
        ]),
      );
      expect(plan.rows[0]).toMatchObject({
        status: 'error',
        column: 'City',
        reason: 'City not found.',
      });
      expect(plan.rows[1]).toMatchObject({
        status: 'error',
        column: 'City',
        reason: 'City is in more than one of your regions.',
      });
      const citiesCall = query.mock.calls.find(([sql]) =>
        (sql as string).includes('FROM "cities"'),
      );
      expect(citiesCall?.[1]).toEqual([['makkah'], ['jeddah', 'riyadh']]);
    });

    it('plans a new locality and a new asset as adds without a database duplicate check', async () => {
      const plan = await preview(
        await upload('new-places.csv', [
          row({ locality: 'Al Malqa', asset: 'Malqa Residence' }),
          row({ asset: 'New Tower' }),
        ]),
      );
      expect(plan).toMatchObject({ willAdd: 2, willSkip: 0, failed: 0 });
      expect(
        query.mock.calls.some(([sql]) =>
          (sql as string).includes('FROM "units"'),
        ),
      ).toBe(false);
    });
  });

  describe('owners', () => {
    it('matches an owner by the last nine phone digits, then by lowercased email', async () => {
      phones = [{ id: OWNER, digits: '501234567' }];
      emails = [{ id: 'owner-by-email', email: 'omar@example.com' }];
      const plan = await preview(
        await upload('owners.csv', [
          row({ unitNumber: '1', ownerPhone: '0501234567' }),
          row({ unitNumber: '2', ownerEmail: 'Omar@Example.com' }),
          row({
            unitNumber: '3',
            ownerPhone: '+966501234567',
            ownerEmail: 'other@example.com',
          }),
        ]),
      );
      expect(plan.rows).toEqual([
        { row: 2, status: 'add' },
        { row: 3, status: 'add' },
        { row: 4, status: 'add' },
      ]);
      const phoneCall = query.mock.calls.find(([sql]) =>
        (sql as string).includes('"phone"'),
      );
      expect(phoneCall?.[1]).toEqual(['company-uuid-1', ['501234567']]);
      const emailCall = query.mock.calls.find(([sql]) =>
        (sql as string).includes('"email"'),
      );
      expect(emailCall?.[1]).toEqual(['company-uuid-1', ['omar@example.com']]);
    });

    it('keeps a row whose owner is not found as an add with a reason', async () => {
      const plan = await preview(
        await upload('no-owner.csv', [
          row({ ownerFirstName: 'Sara', ownerPhone: '+966501234567' }),
        ]),
      );
      expect(plan).toMatchObject({ willAdd: 1, willSkip: 0, failed: 0 });
      expect(plan.rows[0]).toMatchObject({
        row: 2,
        status: 'add',
        reason: OWNER_NOT_FOUND_REASON,
      });
      expect(plan.rows[0].values).toMatchObject({ ownerFirstName: 'Sara' });
    });
  });

  describe('commit', () => {
    it('creates missing localities and assets once each, inserts units and logs counts only', async () => {
      phones = [{ id: OWNER, digits: '501234567' }];
      const result = await commit(
        await upload('commit.csv', [
          row({ unitNumber: '1', ownerPhone: '+966501234567' }),
          row({
            locality: 'Al Malqa',
            asset: 'Malqa Residence',
            unitNumber: '2',
          }),
          row({
            locality: 'Al Malqa',
            asset: 'Malqa Residence',
            unitNumber: '3',
          }),
          row({
            asset: 'New Tower',
            unitNumber: '4',
            ownerEmail: 'x@example.com',
          }),
          row({ unitNumber: '1' }),
        ]),
      );
      expect(result).toMatchObject({ added: 4, skipped: 1, failed: 0 });
      expect(result.failedRows).toEqual([]);
      expect(saveLocalities).toHaveBeenCalledTimes(1);
      expect(saveLocalities).toHaveBeenCalledWith([
        {
          name: 'Al Malqa',
          cityId: CITY,
          createdByCompanyId: 'company-uuid-1',
        },
      ]);
      expect(saveAssets).toHaveBeenCalledTimes(1);
      expect(saveAssets).toHaveBeenCalledWith([
        {
          name: 'Malqa Residence',
          localityId: 'new-locality:Al Malqa',
          createdByCompanyId: 'company-uuid-1',
        },
        {
          name: 'New Tower',
          localityId: LOCALITY,
          createdByCompanyId: 'company-uuid-1',
        },
      ]);
      expect(forget.mock.calls.map(([key]) => key)).toEqual([
        expect.stringContaining(CITY),
        expect.stringContaining('new-locality:Al Malqa'),
        expect.stringContaining(LOCALITY),
      ]);
      const saved = save.mock.calls[0][0] as Record<string, unknown>[];
      expect(saved.map((u) => [u.unitNumber, u.assetId, u.ownerId])).toEqual([
        ['1', ASSET, OWNER],
        ['2', 'new-asset:Malqa Residence', null],
        ['3', 'new-asset:Malqa Residence', null],
        ['4', 'new-asset:New Tower', null],
      ]);
      expect(saved[0]).toMatchObject({
        companyId: 'company-uuid-1',
        subType: 'APARTMENT',
        amenities: [],
        price: null,
      });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toMatchObject({
        companyId: 'company-uuid-1',
        userId: 'user-uuid-1',
        action: 'IMPORT',
        entityType: 'Unit',
        regionCode: 'makkah',
        newValue: {
          added: 4,
          skipped: 1,
          failed: 0,
          notes: 1,
          fileName: 'commit.csv',
        },
      });
      expect(Object.keys(log.mock.calls[0][0].newValue)).toEqual([
        'added',
        'skipped',
        'failed',
        'notes',
        'fileName',
      ]);
    });

    it('lists each unit imported without an owner with its id and locality, never a failed row', async () => {
      units = [{ asset_id: ASSET, key: '3' }];
      const result = await commit(
        await upload('notes.csv', [
          row({
            unitNumber: '1',
            ownerFirstName: 'Only',
            ownerLastName: 'Name',
          }),
          row({ unitNumber: '2' }),
          row({ unitNumber: '3', ownerPhone: '+966500000000' }),
          row({ unitNumber: '', ownerEmail: 'x@example.com' }),
        ]),
      );
      expect(result).toMatchObject({ added: 2, skipped: 1, failed: 1 });
      expect(result.notes).toEqual([
        {
          id: 'unit-1',
          row: 2,
          values: expect.objectContaining({
            unitNumber: '1',
            ownerFirstName: 'Only',
          }),
          reason: OWNER_NOT_FOUND_REASON,
          parentIds: [LOCALITY],
        },
      ]);
      expect(result.failedRows.map((failed) => failed.row)).toEqual([5]);
      expect(forget).not.toHaveBeenCalled();
    });

    it('turns a unique violation on a catalogue insert into a plain conflict', async () => {
      saveLocalities.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23505' } as never),
      );
      await expect(
        commit(await upload('taken.csv', [row({ locality: 'Al Malqa' })])),
      ).rejects.toMatchObject(new ConflictException(PLACE_TAKEN_MESSAGE));
      expect(save).not.toHaveBeenCalled();
      expect(forget).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('refuses to commit a file with a file-level error', async () => {
      await expect(
        commit(await upload('bad.csv', ['Riyadh,x'], 'City,Tower')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(save).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });
  });

  it('rejects a file whose bytes are not text or a workbook', async () => {
    (fileTypeFromFile as jest.Mock).mockResolvedValue({
      mime: 'application/pdf',
      ext: 'pdf',
    });
    await expect(
      preview(await upload('fake.csv', [row({})])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a file', async () => {
    await expect(
      service.preview(undefined, USER, 'company-uuid-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
