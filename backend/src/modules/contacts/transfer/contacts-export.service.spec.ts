import { ForbiddenException } from '@nestjs/common';
import { readSheet } from 'read-excel-file/node';
import { SubscriptionTier } from '../../companies/entities/company.entity';
import {
  CONTACT_EXPORT_COLUMNS,
  ContactsExportService,
  EXPORT_LIMITS,
  toFilters,
} from './contacts-export.service';
import { ExportContactsQueryDto } from '../dto/export-contacts-query.dto';
import { TIER_FEATURE_MESSAGE } from '@shared/utils/tier.util';

// A query builder whose getMany hands out the seeded batches in order, whatever the where clause says.
function fakeQuery(batches: unknown[][]) {
  const queue = [...batches];
  const qb: Record<string, jest.Mock> = {};
  for (const name of ['clone', 'orderBy', 'addOrderBy', 'take', 'andWhere']) {
    qb[name] = jest.fn(() => qb);
  }
  qb.getMany = jest.fn(async () => queue.shift() ?? []);
  return qb;
}

function contact(i: number, regionCode = 'makkah') {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    companyId: 'company-1',
    firstName: `Name${i}`,
    lastName: null,
    email: `c${i}@example.com`,
    phone: `+96650000${String(i).padStart(4, '0')}`,
    isWhatsapp: i % 2 === 0,
    nationality: null,
    nationalId: null,
    contactCompany: null,
    jobTitle: null,
    address: null,
    notes: null,
    regionCode,
    createdBy: null,
    createdAt: new Date('2026-11-19T10:00:00Z'),
    updatedAt: new Date('2026-11-19T10:00:00Z'),
  };
}

function query(overrides: Partial<ExportContactsQueryDto> = {}) {
  return Object.assign(new ExportContactsQueryDto(), overrides);
}

describe('ContactsExportService', () => {
  const viewer = {
    userId: 'user-1',
    role: 'company_admin',
    regionCodes: ['makkah'],
  };
  const findOne = jest.fn();
  const exportQuery = jest.fn();
  const presentMany = jest.fn();
  const log = jest.fn();
  let limits: { batch: number; cap: number };

  const service = () =>
    new ContactsExportService(
      { findOne } as never,
      { exportQuery } as never,
      { presentMany } as never,
      { log } as never,
    );

  beforeEach(() => {
    findOne.mockReset().mockResolvedValue({
      id: 'company-1',
      subscriptionTier: SubscriptionTier.PRO,
    });
    exportQuery.mockReset();
    presentMany.mockReset().mockImplementation(async (_c, _v, rows) =>
      rows.map((r: Record<string, unknown>) => ({
        ...r,
        displayName: r.firstName,
        accessLevel: 'FULL',
      })),
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

  it('writes the twelve template columns plus Created At as CSV with phones unquoted', async () => {
    exportQuery.mockReturnValue(fakeQuery([[contact(1), contact(2)]]));
    const result = await service().export(
      'company-1',
      viewer,
      query({ regionCode: 'makkah' }),
    );
    const text = result.buffer.toString('utf8');
    const lines = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe(
      CONTACT_EXPORT_COLUMNS.map((column) => column.header).join(','),
    );
    expect(CONTACT_EXPORT_COLUMNS).toHaveLength(13);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('+966500000001');
    expect(lines[1]).not.toContain("'+966");
    expect(lines[1]).toContain('2026-11-19 13:00');
    expect(result.fileName).toMatch(/^contacts-makkah-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.contentType).toContain('text/csv');
    expect(result.rows).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('writes XLSX and names the file "all" when every region is included', async () => {
    exportQuery.mockReturnValue(fakeQuery([[contact(1)]]));
    const result = await service().export(
      'company-1',
      viewer,
      query({ format: 'xlsx', allRegions: 'true' }),
    );
    const rows = await readSheet(result.buffer, 1);
    expect(rows[0]).toEqual(
      CONTACT_EXPORT_COLUMNS.map((column) => column.header),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1][2]).toBe('+966500000001');
    expect(result.fileName).toMatch(/^contacts-all-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('walks the keyset in batches, keeps every row once and stops at the cap', async () => {
    Object.assign(EXPORT_LIMITS, { batch: 3, cap: 7 });
    const all = Array.from({ length: 9 }, (_, i) => contact(i + 1));
    exportQuery.mockReturnValue(
      fakeQuery([all.slice(0, 3), all.slice(3, 6), all.slice(6, 9)]),
    );
    const result = await service().export('company-1', viewer, query());
    expect(result.rows).toBe(7);
    expect(result.truncated).toBe(true);
    const lines = result.buffer.toString('utf8').trim().split('\r\n').slice(1);
    const ids = lines.map((line) => line.split(',')[0]);
    expect(new Set(ids).size).toBe(7);
    expect(log.mock.calls[0][0].newValue).toEqual({
      rows: 7,
      truncated: true,
      filters: {},
    });
  });

  it('stops when a batch comes back short and logs one EXPORT row with filters only', async () => {
    Object.assign(EXPORT_LIMITS, { batch: 3, cap: 100 });
    exportQuery.mockReturnValue(
      fakeQuery([[contact(1), contact(2), contact(3)], [contact(4)]]),
    );
    const q = query({
      search: 'Name',
      tag: 'tenant',
      isWhatsapp: 'true',
      regionCode: 'makkah',
    });
    const result = await service().export('company-1', viewer, q);
    expect(result.rows).toBe(4);
    expect(result.truncated).toBe(false);
    expect(exportQuery).toHaveBeenCalledWith(
      'company-1',
      'Name',
      'tenant',
      toFilters(q),
      viewer,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      companyId: 'company-1',
      userId: 'user-1',
      action: 'EXPORT',
      entityType: 'Contact',
      regionCode: 'makkah',
      newValue: {
        rows: 4,
        truncated: false,
        filters: {
          search: 'Name',
          tag: 'tenant',
          isWhatsapp: 'true',
          regionCode: 'makkah',
        },
      },
    });
  });

  it('returns an empty file when the scope has no regions', async () => {
    exportQuery.mockReturnValue(null);
    const result = await service().export('company-1', viewer, query());
    expect(result.rows).toBe(0);
    const lines = result.buffer.toString('utf8').trim().split('\r\n');
    expect(lines).toHaveLength(1);
  });

  it('toFilters mirrors the list handler parsing', () => {
    expect(
      toFilters(
        query({
          agentId: 'a',
          isWhatsapp: 'false',
          company: 'Acme',
          companyExact: 'true',
          nationality: 'Saudi',
          dateFrom: '2026-01-01',
          dateTo: '2026-02-01',
          regionCode: 'makkah',
          allRegions: 'false',
        }),
      ),
    ).toEqual({
      agentId: 'a',
      isWhatsapp: false,
      company: 'Acme',
      companyExact: true,
      nationality: 'Saudi',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      regionCode: 'makkah',
      allRegions: false,
    });
  });
});
