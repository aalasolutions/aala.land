import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { connectTestDatabase } from './test-data-source';
import { seedCompany } from './harness';
import { Company } from '../../src/modules/companies/entities/company.entity';
import { Contact } from '../../src/modules/contacts/entities/contact.entity';
import { Lead } from '../../src/modules/leads/entities/lead.entity';
import { Unit } from '../../src/modules/properties/entities/unit.entity';
import { Lease } from '../../src/modules/leases/entities/lease.entity';
import { WhatsappChat } from '../../src/modules/whatsapp/entities/whatsapp-chat.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { ContactAccessRequest } from '../../src/modules/contact-access-requests/entities/contact-access-request.entity';
import { ContactsService } from '../../src/modules/contacts/contacts.service';
import { ContactPrivacyService } from '../../src/modules/contacts/contact-privacy.service';
import {
  ContactsExportService,
  EXPORT_LIMITS,
} from '../../src/modules/contacts/transfer/contacts-export.service';
import { ExportContactsQueryDto } from '../../src/modules/contacts/dto/export-contacts-query.dto';

// Microseconds on purpose: a millisecond cursor would skip every row after the first batch.
const TIED_AT = '2026-11-01 08:00:00.123456+00';
const TOTAL = 2500;

// Keyset order with tied sort keys and the region scope only prove themselves against a real database.
describe('contacts export against a real database', () => {
  let dataSource: DataSource;
  let companyId: string;
  const userId = randomUUID();
  const log = jest.fn();
  const limits = { ...EXPORT_LIMITS };

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
    const company = await seedCompany(dataSource.manager, 'Export Co', [
      'makkah',
      'punjab',
    ]);
    companyId = company.id;
    await dataSource.manager.query(
      `UPDATE "companies" SET "subscription_tier" = 'PRO' WHERE "id" = $1`,
      [companyId],
    );
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const region = i % 5 === 0 ? 'punjab' : 'makkah';
      params.push(
        companyId,
        `N${i}`,
        `c${i}@example.com`,
        `+96650${String(i).padStart(7, '0')}`,
        region,
        TIED_AT,
      );
      const base = i * 6;
      const slots = [1, 2, 3, 4, 5].map((n) => `$${base + n}`);
      slots.push(`$${base + 6}::timestamptz`);
      values.push(`(${slots.join(', ')})`);
    }
    await dataSource.manager.query(
      `INSERT INTO "contacts" ("company_id", "first_name", "email", "phone", "region_code", "created_at")
       VALUES ${values.join(',')}`,
      params,
    );
  });

  afterAll(async () => {
    Object.assign(EXPORT_LIMITS, limits);
    if (dataSource && companyId) {
      await dataSource.manager.query(
        'DELETE FROM "contacts" WHERE "company_id" = $1',
        [companyId],
      );
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
    const contacts = new ContactsService(
      dataSource,
      dataSource.getRepository(Contact),
      dataSource.getRepository(Lead),
      dataSource.getRepository(Unit),
      dataSource.getRepository(Lease),
      dataSource.getRepository(WhatsappChat),
      dataSource.getRepository(Company),
      null as never,
      privacy,
      null as never,
      null as never,
    );
    return new ContactsExportService(
      dataSource.getRepository(Company),
      contacts,
      privacy,
      { log } as never,
    );
  }

  const viewer = () => ({
    userId,
    role: 'company_admin',
    regionCodes: ['makkah', 'punjab'],
  });

  function query(overrides: Partial<ExportContactsQueryDto> = {}) {
    return Object.assign(new ExportContactsQueryDto(), overrides);
  }

  function emails(buffer: Buffer): string[] {
    return buffer
      .toString('utf8')
      .replace(/^﻿/, '')
      .trim()
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',')[3]);
  }

  it('walks 2,500 rows that share one microsecond created_at across batches without a gap or a repeat', async () => {
    const result = await service().export(
      companyId,
      viewer(),
      query({ allRegions: 'true' }),
    );
    const seen = emails(result.buffer);
    expect(result.rows).toBe(TOTAL);
    expect(result.truncated).toBe(false);
    expect(new Set(seen).size).toBe(TOTAL);
  });

  it('scopes to the requested region and widens with allRegions', async () => {
    const scoped = await service().export(
      companyId,
      viewer(),
      query({ regionCode: 'punjab' }),
    );
    expect(scoped.rows).toBe(TOTAL / 5);
    expect(scoped.fileName).toMatch(/^contacts-punjab-/);
    const all = await service().export(
      companyId,
      viewer(),
      query({ allRegions: 'true', regionCode: 'punjab' }),
    );
    expect(all.rows).toBe(TOTAL);
    expect(all.fileName).toMatch(/^contacts-all-/);
  });

  it('stops at the cap and says so, with one EXPORT audit row per export', async () => {
    Object.assign(EXPORT_LIMITS, { batch: 700, cap: 2000 });
    const result = await service().export(
      companyId,
      viewer(),
      query({ allRegions: 'true' }),
    );
    expect(result.rows).toBe(2000);
    expect(result.truncated).toBe(true);
    expect(new Set(emails(result.buffer)).size).toBe(2000);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      companyId,
      userId,
      action: 'EXPORT',
      entityType: 'Contact',
      regionCode: null,
      newValue: {
        rows: 2000,
        truncated: true,
        filters: { allRegions: 'true' },
      },
    });
  });
});
