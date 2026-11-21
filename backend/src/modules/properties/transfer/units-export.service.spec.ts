import { ForbiddenException } from '@nestjs/common';
import { readSheet } from 'read-excel-file/node';
import { SubscriptionTier } from '../../companies/entities/company.entity';
import {
  UNIT_EXPORT_COLUMNS,
  UnitsExportService,
  EXPORT_LIMITS,
} from './units-export.service';
import { UNIT_COLUMNS, UNIT_TEMPLATE_EXAMPLE } from './unit.columns';
import { ExportUnitsQueryDto } from '../dto/export-units-query.dto';
import { toUnitFilters } from '../unit-filters.util';
import { UnitArchivedFilter } from '../dto/unit-archived-filter.enum';
import { TIER_FEATURE_MESSAGE } from '@shared/utils/tier.util';

// A query builder that hands out the seeded batches in order, whatever the where clause says.
function fakeQuery(batches: unknown[][]) {
  const queue = [...batches];
  const qb: Record<string, jest.Mock> = {};
  const chain = [
    'clone',
    'addSelect',
    'orderBy',
    'addOrderBy',
    'limit',
    'andWhere',
  ];
  for (const name of chain) {
    qb[name] = jest.fn(() => qb);
  }
  qb.getRawAndEntities = jest.fn(async () => {
    const entities = queue.shift() ?? [];
    return {
      entities,
      raw: entities.map(() => ({ cursor_at: '2026-11-01 08:00:00.123456+00' })),
    };
  });
  return qb;
}

function unit(i: number, regionCode = 'makkah') {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    companyId: 'company-1',
    unitNumber: `U-${i}`,
    assetId: 'asset-1',
    asset: {
      id: 'asset-1',
      name: 'Olaya Towers',
      locality: {
        id: 'loc-1',
        name: 'Al Olaya',
        city: { id: 'city-1', name: 'Riyadh', regionCode },
      },
    },
    ownerId: i % 2 === 0 ? 'owner-1' : null,
    owner:
      i % 2 === 0
        ? {
            id: 'owner-1',
            firstName: 'Sara',
            lastName: 'Al Mansoori',
            phone: '+966501234567',
            email: 'sara@example.com',
          }
        : null,
    status: 'available',
    price: '85000.00',
    sqFt: '1450.50',
    bedrooms: 2,
    bathrooms: 2.5,
    propertyType: 'RENTAL',
    subType: 'APARTMENT',
    amenities: ['covered_parking', 'gym'],
    description: 'Corner unit, "city" view',
    floor: '12',
    photos: [],
    deletedAt: null,
    createdAt: new Date('2026-11-19T10:00:00Z'),
    updatedAt: new Date('2026-11-19T10:00:00Z'),
  };
}

function query(overrides: Partial<ExportUnitsQueryDto> = {}) {
  return Object.assign(new ExportUnitsQueryDto(), overrides);
}

function csvLines(buffer: Buffer): string[] {
  return buffer.toString('utf8').replace(/^﻿/, '').trim().split('\r\n');
}

describe('UnitsExportService', () => {
  const viewer = {
    userId: 'user-1',
    role: 'company_admin',
    regionCodes: ['makkah'],
  };
  const findOne = jest.fn();
  const exportQuery = jest.fn();
  const accessLevelFor = jest.fn();
  const log = jest.fn();
  let limits: { batch: number; cap: number };

  const service = () =>
    new UnitsExportService(
      { findOne } as never,
      { exportQuery } as never,
      { accessLevelFor } as never,
      { log } as never,
    );

  beforeEach(() => {
    findOne.mockReset().mockResolvedValue({
      id: 'company-1',
      subscriptionTier: SubscriptionTier.PRO,
    });
    exportQuery.mockReset();
    accessLevelFor
      .mockReset()
      .mockImplementation(
        async (_c, _v, owners: { id: string }[]) =>
          new Map(owners.map((owner) => [owner.id, 'FULL'])),
      );
    log.mockReset().mockResolvedValue(undefined);
    limits = { ...EXPORT_LIMITS };
  });

  afterEach(() => {
    Object.assign(EXPORT_LIMITS, limits);
  });

  it('refuses the free tier with the plain message and never queries', async () => {
    findOne.mockResolvedValue({
      id: 'company-1',
      subscriptionTier: SubscriptionTier.FREE,
    });
    await expect(
      service().export('company-1', viewer, query()),
    ).rejects.toThrow(new ForbiddenException(TIER_FEATURE_MESSAGE));
    expect(exportQuery).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('writes the eighteen template columns plus Created At as CSV in the entity enum spelling', async () => {
    exportQuery.mockReturnValue(fakeQuery([[unit(1), unit(2)]]));
    const result = await service().export(
      'company-1',
      viewer,
      query({ regionCode: 'makkah' }),
    );
    const lines = csvLines(result.buffer);
    expect(lines[0]).toBe(
      UNIT_EXPORT_COLUMNS.map((column) => column.header).join(','),
    );
    expect(UNIT_COLUMNS).toHaveLength(18);
    expect(UNIT_EXPORT_COLUMNS).toHaveLength(19);
    expect(lines).toHaveLength(3);
    // Odd rows have no owner, so the owner cells are empty.
    expect(lines[1]).toBe(
      'Riyadh,Al Olaya,Olaya Towers,U-1,APARTMENT,available,RENTAL,85000,1450.5,2,2.5,12,"covered_parking;gym","Corner unit, ""city"" view",,,,,2026-11-19 13:00',
    );
    expect(lines[2]).toContain(
      ',Sara,Al Mansoori,+966501234567,sara@example.com,',
    );
    expect(lines[2]).not.toContain("'+966");
    expect(result.fileName).toMatch(/^units-makkah-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.contentType).toContain('text/csv');
    expect(result.rows).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('blanks the owner cells when the viewer is LIMITED on that contact', async () => {
    accessLevelFor.mockResolvedValue(new Map([['owner-1', 'LIMITED']]));
    exportQuery.mockReturnValue(fakeQuery([[unit(2)]]));
    const result = await service().export('company-1', viewer, query());
    const cells = csvLines(result.buffer)[1].split(',');
    expect(cells.slice(-5, -1)).toEqual(['', '', '', '']);
  });

  it('writes XLSX with numeric cells and names the file "all" without a known region', async () => {
    exportQuery.mockReturnValue(fakeQuery([[unit(2)]]));
    const result = await service().export(
      'company-1',
      viewer,
      query({ format: 'xlsx' }),
    );
    const rows = await readSheet(result.buffer, 1);
    expect(rows[0]).toEqual(UNIT_EXPORT_COLUMNS.map((column) => column.header));
    expect(rows).toHaveLength(2);
    expect(rows[1][3]).toBe('U-2');
    expect(rows[1][7]).toBe(85000);
    expect(rows[1][8]).toBe(1450.5);
    expect(rows[1][16]).toBe('+966501234567');
    expect(result.fileName).toMatch(/^units-all-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('walks the keyset in batches, keeps every row once and stops at the cap', async () => {
    Object.assign(EXPORT_LIMITS, { batch: 3, cap: 7 });
    const all = Array.from({ length: 9 }, (_, i) => unit(i + 1));
    exportQuery.mockReturnValue(
      fakeQuery([all.slice(0, 3), all.slice(3, 6), all.slice(6, 9)]),
    );
    const result = await service().export('company-1', viewer, query());
    expect(result.rows).toBe(7);
    expect(result.truncated).toBe(true);
    const numbers = csvLines(result.buffer)
      .slice(1)
      .map((line) => line.split(',')[3]);
    expect(new Set(numbers).size).toBe(7);
    expect(log.mock.calls[0][0].newValue).toEqual({
      rows: 7,
      truncated: true,
      filters: {},
    });
  });

  it('stops when a batch comes back short and logs one EXPORT row with filters only', async () => {
    Object.assign(EXPORT_LIMITS, { batch: 3, cap: 100 });
    exportQuery.mockReturnValue(
      fakeQuery([[unit(1), unit(2), unit(3)], [unit(4)]]),
    );
    const q = query({
      status: 'available' as never,
      minBeds: '2',
      amenities: 'gym, covered_parking',
      regionCode: 'makkah',
    });
    const result = await service().export('company-1', viewer, q);
    expect(result.rows).toBe(4);
    expect(result.truncated).toBe(false);
    expect(exportQuery).toHaveBeenCalledWith(
      'company-1',
      toUnitFilters(q),
      viewer,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      companyId: 'company-1',
      userId: 'user-1',
      action: 'EXPORT',
      entityType: 'Unit',
      regionCode: 'makkah',
      newValue: {
        rows: 4,
        truncated: false,
        filters: {
          status: 'available',
          minBeds: '2',
          amenities: 'gym, covered_parking',
          regionCode: 'makkah',
        },
      },
    });
  });

  it('returns an empty file when the scope has no regions', async () => {
    exportQuery.mockReturnValue(null);
    const result = await service().export('company-1', viewer, query());
    expect(result.rows).toBe(0);
    expect(csvLines(result.buffer)).toHaveLength(1);
  });

  it('toUnitFilters is the list handler parsing', () => {
    expect(
      toUnitFilters(
        query({
          amenities: 'gym, covered_parking,,',
          propertyType: 'RENTAL' as never,
          status: 'rented' as never,
          minPrice: '1000',
          maxPrice: '5000',
          minBeds: '1',
          maxBeds: '3',
          localityId: 'loc-1',
          regionCode: 'makkah',
          ownerId: 'owner-1',
          archived: UnitArchivedFilter.INCLUDE,
        }),
      ),
    ).toEqual({
      amenities: ['gym', 'covered_parking'],
      propertyType: 'RENTAL',
      status: 'rented',
      minPrice: 1000,
      maxPrice: 5000,
      minBeds: 1,
      maxBeds: 3,
      localityId: 'loc-1',
      regionCode: 'makkah',
      ownerId: 'owner-1',
      archived: UnitArchivedFilter.INCLUDE,
    });
    expect(toUnitFilters(query())).toEqual({
      amenities: undefined,
      propertyType: undefined,
      status: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minBeds: undefined,
      maxBeds: undefined,
      localityId: undefined,
      regionCode: undefined,
      ownerId: undefined,
      archived: undefined,
    });
  });

  it('the template example fills every template column', () => {
    expect(Object.keys(UNIT_TEMPLATE_EXAMPLE).sort()).toEqual(
      UNIT_COLUMNS.map((column) => column.key).sort(),
    );
  });
});
