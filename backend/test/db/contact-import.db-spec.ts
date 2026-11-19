import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectTestDatabase } from './test-data-source';
import { seedCompany } from './harness';
import { Company } from '../../src/modules/companies/entities/company.entity';
import { Contact } from '../../src/modules/contacts/entities/contact.entity';
import { ContactsImportService } from '../../src/modules/data-transfer/contacts-import.service';

jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn().mockResolvedValue(undefined),
}));

const HEADERS =
  'First Name,Last Name,Phone,Email,WhatsApp,Nationality,National ID,Company,Job Title,Address,Notes,Region';

class FailingRelink extends ContactsImportService {
  protected async relinkChats(): Promise<void> {
    throw new Error('relink failed on purpose');
  }
}

// The company lock, the transaction and the chat relink only prove themselves against a real database.
describe('contacts import against a real database', () => {
  let dataSource: DataSource;
  let dir: string;
  let companyId: string;
  const userId = randomUUID();
  const log = jest.fn();

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
    dir = await mkdtemp(join(tmpdir(), 'contact-import-db-'));
    const company = await seedCompany(dataSource.manager, 'Import Co', [
      'makkah',
    ]);
    companyId = company.id;
  });

  afterAll(async () => {
    if (dataSource && companyId) {
      await dataSource.manager.query(
        'DELETE FROM "whatsapp_chats" WHERE "company_id" = $1',
        [companyId],
      );
      await dataSource.manager.query(
        'DELETE FROM "contacts" WHERE "company_id" = $1',
        [companyId],
      );
      await dataSource.manager.delete(Company, { id: companyId });
    }
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    log.mockReset();
    await dataSource.manager.query(
      'DELETE FROM "whatsapp_chats" WHERE "company_id" = $1',
      [companyId],
    );
    await dataSource.manager.query(
      'DELETE FROM "contacts" WHERE "company_id" = $1',
      [companyId],
    );
  });

  function service(Klass = ContactsImportService) {
    return new Klass(dataSource.getRepository(Company), dataSource, {
      log,
    } as never);
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

  const TWO = [
    'Sara,Al Mansoori,+966501234567,sara@example.com,Yes,,,,,,,',
    'Omar,,,omar@example.com,,,,,,,,',
  ];

  function count(manager: EntityManager = dataSource.manager) {
    return manager.count(Contact, { where: { companyId } });
  }

  it('inserts the add rows with region, creator and defaults, and logs counts only', async () => {
    const result = await service().commit(
      await file('two.csv', TWO),
      user(),
      companyId,
      undefined,
    );
    expect(result).toMatchObject({
      added: 2,
      skipped: 0,
      failed: 0,
      failedRows: [],
    });
    const rows = await dataSource.manager.find(Contact, {
      where: { companyId },
      order: { firstName: 'ASC' },
    });
    expect(
      rows.map((r) => [r.firstName, r.regionCode, r.createdBy, r.isWhatsapp]),
    ).toEqual([
      ['Omar', 'makkah', userId, false],
      ['Sara', 'makkah', userId, true],
    ]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      companyId,
      userId,
      action: 'IMPORT',
      entityType: 'Contact',
      regionCode: 'makkah',
      newValue: { added: 2, skipped: 0, failed: 0, fileName: 'two.csv' },
    });
    expect(Object.keys(log.mock.calls[0][0].newValue)).toEqual([
      'added',
      'skipped',
      'failed',
      'fileName',
    ]);
  });

  it('skips rows that already exist on a second run of the same file', async () => {
    await service().commit(
      await file('first.csv', TWO),
      user(),
      companyId,
      undefined,
    );
    const again = await service().commit(
      await file('again.csv', TWO),
      user(),
      companyId,
      undefined,
    );
    expect(again).toMatchObject({ added: 0, skipped: 2, failed: 0 });
    expect(again.failedRows.map((r) => r.reason)).toEqual([
      'Already exists in Makkah',
      'Already exists in Makkah',
    ]);
    expect(await count()).toBe(2);
  });

  it('serializes parallel commits of the same file through the company lock', async () => {
    const [a, b] = await Promise.all([
      service().commit(
        await file('par-a.csv', TWO),
        user(),
        companyId,
        undefined,
      ),
      service().commit(
        await file('par-b.csv', TWO),
        user(),
        companyId,
        undefined,
      ),
    ]);
    expect([a.added, b.added].sort()).toEqual([0, 2]);
    expect(await count()).toBe(2);
  });

  it('rolls back every insert when a later step in the transaction throws', async () => {
    await expect(
      service(FailingRelink).commit(
        await file('rollback.csv', TWO),
        user(),
        companyId,
        undefined,
      ),
    ).rejects.toThrow('relink failed on purpose');
    expect(await count()).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('relinks WhatsApp chats whose number matches an inserted contact', async () => {
    await dataSource.manager.query(
      `INSERT INTO "whatsapp_chats" ("company_id", "user_id", "chat_id", "contact_resolution_attempted")
       VALUES ($1, $2, '966501234567@s.whatsapp.net', true), ($1, $2, '120363000000000000@g.us', true)`,
      [companyId, userId],
    );
    await dataSource.manager.query(
      `UPDATE "whatsapp_chats" SET "is_group" = true WHERE "company_id" = $1 AND "chat_id" LIKE '%@g.us'`,
      [companyId],
    );
    await service().commit(
      await file('relink.csv', TWO),
      user(),
      companyId,
      undefined,
    );
    const sara = await dataSource.manager.findOneByOrFail(Contact, {
      companyId,
      firstName: 'Sara',
    });
    const chats: {
      chat_id: string;
      contact_id: string | null;
      contact_resolution_attempted: boolean;
    }[] = await dataSource.manager.query(
      'SELECT "chat_id", "contact_id", "contact_resolution_attempted" FROM "whatsapp_chats" WHERE "company_id" = $1 ORDER BY "chat_id"',
      [companyId],
    );
    expect(chats).toEqual([
      {
        chat_id: '120363000000000000@g.us',
        contact_id: null,
        contact_resolution_attempted: true,
      },
      {
        chat_id: '966501234567@s.whatsapp.net',
        contact_id: sara.id,
        contact_resolution_attempted: false,
      },
    ]);
  });
});
