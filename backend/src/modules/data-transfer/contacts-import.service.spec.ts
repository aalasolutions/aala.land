import { BadRequestException } from '@nestjs/common';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { ContactsImportService } from './contacts-import.service';
import { typeRows } from './import-validation';
import { CreateContactDto } from '../contacts/dto/create-contact.dto';
import type { ColumnDef } from '@shared/spreadsheet/column-def';

const HEADERS =
  'First Name,Last Name,Phone,Email,WhatsApp,Nationality,National ID,Company,Job Title,Address,Notes,Region';

const USER = {
  userId: 'user-uuid-1',
  email: 'admin@example.com',
  companyId: 'company-uuid-1',
  role: 'company_admin',
  regionCodes: ['makkah', 'punjab'],
};

describe('ContactsImportService', () => {
  let dir: string;
  let service: ContactsImportService;
  let regions: string[];
  const query = jest.fn();
  const log = jest.fn();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'contacts-import-'));
  });

  beforeEach(() => {
    regions = ['makkah'];
    query.mockReset();
    query.mockResolvedValue([]);
    log.mockReset();
    (fileTypeFromFile as jest.Mock).mockResolvedValue(undefined);
    const companyRepository = {
      findOne: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ id: 'company-uuid-1', activeRegions: regions }),
        ),
    };
    const dataSource = { manager: { query } };
    service = new ContactsImportService(
      companyRepository as never,
      dataSource as never,
      { log } as never,
    );
  });

  async function upload(name: string, lines: string[]) {
    const path = join(dir, `${Date.now()}-${name}`);
    await writeFile(path, [HEADERS, ...lines].join('\r\n'), 'utf8');
    return {
      path,
      originalname: name,
      mimetype: 'text/csv',
    } as Express.Multer.File;
  }

  function row(
    first: string,
    phone = '',
    email = '',
    rest = ',,,,,,,',
    region = '',
  ) {
    return `${first},,${phone},${email}${rest},${region}`;
  }

  it('adds valid rows and reports the counts', async () => {
    const plan = await service.preview(
      await upload('ok.csv', [
        row('Sara', '+966501234567'),
        row('Omar', '+966501234568', 'omar@example.com'),
      ]),
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan).toMatchObject({
      willAdd: 2,
      willSkip: 0,
      failed: 0,
      fileErrors: [],
    });
    expect(plan.rows).toEqual([
      { row: 2, status: 'add' },
      { row: 3, status: 'add' },
    ]);
  });

  it('fails a row without a first name or without a phone, naming the column like the contact form', async () => {
    const plan = await service.preview(
      await upload('required.csv', [
        ',Al Mansoori,+966501234567,,Yes,,,,,,,',
        row('Omar', '', 'omar@example.com'),
      ]),
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan.failed).toBe(2);
    expect(plan.rows[0]).toMatchObject({
      row: 2,
      status: 'error',
      column: 'First Name',
      reason: 'Enter a first name.',
    });
    expect(plan.rows[0].values).toMatchObject({ lastName: 'Al Mansoori' });
    expect(plan.rows[1]).toMatchObject({
      row: 3,
      status: 'error',
      column: 'Phone',
      reason: 'Enter a phone number.',
    });
  });

  it('reports a missing First Name or Phone header as a file error', async () => {
    const path = join(dir, 'no-phone-header.csv');
    await writeFile(
      path,
      'First Name,Email\r\nSara,sara@example.com\r\n',
      'utf8',
    );
    const plan = await service.preview(
      {
        path,
        originalname: 'no-phone-header.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File,
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.fileErrors).toEqual([
      expect.objectContaining({ code: 'MISSING_HEADER', header: 'Phone' }),
    ]);
  });

  it('reports an unknown header as a file error and no rows', async () => {
    const path = join(dir, 'bad-header.csv');
    await writeFile(path, 'First Name,Mobile\r\nSara,123\r\n', 'utf8');
    const plan = await service.preview(
      {
        path,
        originalname: 'bad-header.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File,
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.fileErrors[0]).toMatchObject({
      code: 'UNKNOWN_HEADER',
      header: 'Mobile',
    });
  });

  it('ignores the export-only Created At column', async () => {
    const path = join(dir, 'exported.csv');
    await writeFile(
      path,
      'First Name,Phone,Created At\r\nSara,+966500000001,2026-01-01 10:00\r\n',
      'utf8',
    );
    const plan = await service.preview(
      {
        path,
        originalname: 'exported.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File,
      USER,
      'company-uuid-1',
      'makkah',
    );
    expect(plan.fileErrors).toEqual([]);
    expect(plan.rows[0]).toMatchObject({ row: 2, status: 'add' });
  });

  it('refuses to commit a file with a file-level error', async () => {
    const path = join(dir, 'bad-header-commit.csv');
    await writeFile(path, 'First Name,Mobile\r\nSara,123\r\n', 'utf8');
    await expect(
      service.commit(
        {
          path,
          originalname: 'bad.csv',
          mimetype: 'text/csv',
        } as Express.Multer.File,
        USER,
        'company-uuid-1',
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips an in-file duplicate by the last nine phone digits, first occurrence wins', async () => {
    const plan = await service.preview(
      await upload('dup.csv', [
        row('Sara', '+966501234567'),
        row('Sara again', '0501234567'),
      ]),
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan).toMatchObject({ willAdd: 1, willSkip: 1 });
    expect(plan.rows[1]).toMatchObject({
      row: 3,
      status: 'skip',
      reason: 'Duplicate of row 2',
    });
  });

  // A phone with no digits has no phone key, so the email key is the fallback, as in findDuplicate.
  it('skips database duplicates by phone and by email with the region name only', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('"phone"')
          ? [{ digits: '501234567', region_code: 'makkah' }]
          : [{ email: 'omar@example.com', region_code: 'punjab' }],
      ),
    );
    const plan = await service.preview(
      await upload('db-dup.csv', [
        row('Sara', '+966501234567'),
        row('Omar', '-', 'Omar@Example.com'),
        row('Lina', '-', 'lina@example.com'),
      ]),
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan).toMatchObject({ willAdd: 1, willSkip: 2 });
    expect(plan.rows[0]).toMatchObject({
      status: 'skip',
      reason: 'Already exists in Makkah',
    });
    expect(plan.rows[1]).toMatchObject({
      status: 'skip',
      reason: 'Already exists in Punjab',
    });
    expect(plan.rows[2]).toMatchObject({ status: 'add' });
    expect(JSON.stringify(plan)).not.toContain('contact-id');
  });

  it('matches phones in one batched query and emails in another', async () => {
    await service.preview(
      await upload('batch.csv', [
        row('A', '+966501111111'),
        row('B', '-', 'b@example.com'),
      ]),
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual(['company-uuid-1', ['501111111']]);
    expect(query.mock.calls[1][1]).toEqual([
      'company-uuid-1',
      ['b@example.com'],
    ]);
  });

  describe('regions', () => {
    it('takes the only active region when the cell is blank', async () => {
      const plan = await service.preview(
        await upload('one-region.csv', [row('Sara', '+966501234567')]),
        USER,
        'company-uuid-1',
        undefined,
      );
      expect(plan.rows[0].status).toBe('add');
    });

    it('needs a picked region when the company has several and the cell is blank', async () => {
      regions = ['makkah', 'punjab'];
      const plan = await service.preview(
        await upload('multi.csv', [row('Sara', '+966501234567')]),
        USER,
        'company-uuid-1',
        undefined,
      );
      expect(plan.rows[0]).toMatchObject({
        status: 'error',
        column: 'Region',
        reason: 'Choose a region.',
      });
      const picked = await service.preview(
        await upload('multi-picked.csv', [row('Sara', '+966501234567')]),
        USER,
        'company-uuid-1',
        'punjab',
      );
      expect(picked.rows[0].status).toBe('add');
    });

    it('rejects a Region cell that is not active and a picked region that is not active', async () => {
      const plan = await service.preview(
        await upload('bad-region.csv', [
          row('Sara', '+966501234567', '', ',,,,,,,', 'dubai'),
        ]),
        USER,
        'company-uuid-1',
        undefined,
      );
      expect(plan.rows[0]).toMatchObject({ status: 'error', column: 'Region' });
      await expect(
        service.preview(
          await upload('bad-pick.csv', [row('Sara', '+966501234567')]),
          USER,
          'company-uuid-1',
          'dubai',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a Region cell in any letter case', async () => {
      regions = ['makkah', 'punjab'];
      const plan = await service.preview(
        await upload('case.csv', [
          row('Sara', '+966501234567', '', ',,,,,,,', 'Punjab'),
        ]),
        USER,
        'company-uuid-1',
        undefined,
      );
      expect(plan.rows[0].status).toBe('add');
    });
  });

  it('turns a bad WhatsApp word and an invalid email into row errors with plain words', async () => {
    const plan = await service.preview(
      await upload('cells.csv', [
        'Sara,,+966501234567,,maybe,,,,,,,',
        'Omar,,+966501234568,not-an-email,,,,,,,,',
      ]),
      USER,
      'company-uuid-1',
      undefined,
    );
    expect(plan.rows[0]).toMatchObject({
      status: 'error',
      column: 'WhatsApp',
      reason: 'Use Yes or No.',
    });
    expect(plan.rows[1]).toMatchObject({
      status: 'error',
      column: 'Email',
      reason: 'Enter a valid email address.',
    });
  });

  it('rejects a file whose bytes are not text or a workbook', async () => {
    (fileTypeFromFile as jest.Mock).mockResolvedValue({
      mime: 'application/pdf',
      ext: 'pdf',
    });
    await expect(
      service.preview(
        await upload('fake.csv', [row('Sara', '1')]),
        USER,
        'company-uuid-1',
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a file', async () => {
    await expect(
      service.preview(undefined, USER, 'company-uuid-1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('typeRows', () => {
  const columns: ColumnDef[] = [
    {
      header: 'First Name',
      key: 'firstName',
      type: 'string',
      required: true,
      maxLength: 100,
    },
    { header: 'Phone', key: 'phone', type: 'string', maxLength: 50 },
  ];

  it('reports a missing required cell with the column header', async () => {
    const typed = await typeRows([{ phone: '123' }], columns, CreateContactDto);
    expect(typed[0].problem).toEqual({
      column: 'First Name',
      reason: 'This cell is required.',
    });
  });

  it('reports a DTO length violation with the column header and the limit', async () => {
    const typed = await typeRows(
      [{ firstName: 'x'.repeat(101) }],
      columns,
      CreateContactDto,
    );
    expect(typed[0].problem).toEqual({
      column: 'First Name',
      reason: 'Use at most 100 characters.',
    });
  });

  it('leaves a blank optional cell undefined so DTO rules skip it', async () => {
    const typed = await typeRows(
      [{ firstName: 'Sara', phone: undefined }],
      columns,
      CreateContactDto,
    );
    expect(typed[0].problem).toBeUndefined();
    expect(typed[0].dto.phone).toBeUndefined();
  });
});
