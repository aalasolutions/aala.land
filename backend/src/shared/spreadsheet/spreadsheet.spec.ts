import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import type { ColumnDef } from './column-def';
import { readRows, ZIP_MAX_ENTRIES } from './spreadsheet-reader';
import { writeCsv, writeRows } from './spreadsheet-writer';
import { sanitizeForExport, sanitizeFromImport } from './cell-sanitize.util';

const COLUMNS: ColumnDef[] = [
  { header: 'First Name', key: 'firstName', type: 'string', required: true },
  { header: 'Phone', key: 'phone', type: 'string' },
  { header: 'Notes', key: 'notes', type: 'string' },
  { header: 'Score', key: 'score', type: 'number' },
];

const BOM = '﻿';

describe('spreadsheet kernel', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'spreadsheet-spec-'));
  });

  async function csvFile(name: string, text: string): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, text, 'utf8');
    return path;
  }

  async function read(path: string, mime?: string) {
    return readRows(path, mime, COLUMNS, { maxRows: 100 });
  }

  describe('readRows (CSV)', () => {
    it('reads a BOM file with Arabic text and leading zeros intact', async () => {
      const path = await csvFile(
        'bom.csv',
        `${BOM}First Name,Phone,Notes\r\nسارة,0501234567,"ملاحظة, مع فاصلة"\r\n`,
      );
      const result = await read(path, 'text/csv');
      expect(result.errors).toEqual([]);
      expect(result.rows).toEqual([
        { firstName: 'سارة', phone: '0501234567', notes: 'ملاحظة, مع فاصلة' },
      ]);
    });

    it('accepts a semicolon delimiter and quoted commas', async () => {
      const path = await csvFile(
        'semi.csv',
        'First Name;Phone;Notes\n"Doe, Jane";+966 50;x\n',
      );
      const result = await read(path);
      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toEqual({
        firstName: 'Doe, Jane',
        phone: '+966 50',
        notes: 'x',
      });
    });

    it('keeps an unquoted semicolon inside a cell of a comma file', async () => {
      const path = await csvFile(
        'semi-in-cell.csv',
        'First Name,Phone,Notes\nSara,+966 50,gym;pool\n',
      );
      const result = await read(path);
      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toEqual({
        firstName: 'Sara',
        phone: '+966 50',
        notes: 'gym;pool',
      });
    });

    it('keeps an unquoted comma inside a cell of a semicolon file', async () => {
      const path = await csvFile(
        'comma-in-cell.csv',
        'First Name;Phone;Notes\nSara;+966 50;gym,pool\n',
      );
      const result = await read(path);
      expect(result.errors).toEqual([]);
      expect(result.rows[0].notes).toBe('gym,pool');
    });

    it('maps empty cells and missing trailing cells to undefined', async () => {
      const path = await csvFile(
        'empty.csv',
        'First Name,Phone,Notes\nAmy,,\nBob\n',
      );
      const result = await read(path);
      expect(result.errors).toEqual([]);
      expect(result.rows).toEqual([
        { firstName: 'Amy', phone: undefined, notes: undefined },
        { firstName: 'Bob', phone: undefined, notes: undefined },
      ]);
    });

    it('strips the import apostrophe that export adds', async () => {
      const path = await csvFile('apos.csv', "First Name\n'=SUM(1)\n");
      const result = await read(path);
      expect(result.rows[0].firstName).toBe('=SUM(1)');
    });

    it('matches headers case-insensitively and maps by header, not position', async () => {
      const path = await csvFile('order.csv', 'phone,FIRST NAME\n1,Amy\n');
      const result = await read(path);
      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toEqual({ phone: '1', firstName: 'Amy' });
    });

    it('rejects an unknown header', async () => {
      const path = await csvFile('unknown.csv', 'First Name,Mobile\nAmy,1\n');
      const result = await read(path);
      expect(result.rows).toEqual([]);
      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'UNKNOWN_HEADER', header: 'Mobile' }),
      ]);
    });

    it('drops an ignored header instead of rejecting it', async () => {
      const path = await csvFile(
        'ignored.csv',
        'First Name,Created At,Mobile\nAmy,2026-01-01,1\n',
      );
      const strict = await readRows(path, undefined, COLUMNS, {
        maxRows: 100,
        ignoreHeaders: ['Created At'],
      });
      expect(strict.errors).toEqual([
        expect.objectContaining({ code: 'UNKNOWN_HEADER', header: 'Mobile' }),
      ]);
      const ok = await csvFile(
        'ignored-ok.csv',
        'First Name,created at\nAmy,2026-01-01\n',
      );
      const result = await readRows(ok, undefined, COLUMNS, {
        maxRows: 100,
        ignoreHeaders: ['Created At'],
      });
      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toEqual({ firstName: 'Amy' });
    });

    it('rejects a missing required header and a duplicate header', async () => {
      const path = await csvFile('missing.csv', 'Phone,Phone\n1,2\n');
      const result = await read(path);
      expect(result.errors.map((e) => e.code).sort()).toEqual([
        'DUPLICATE_HEADER',
        'MISSING_HEADER',
      ]);
    });

    it('enforces the row cap', async () => {
      const lines = Array.from({ length: 101 }, (_, i) => `n${i}`).join('\n');
      const path = await csvFile('cap.csv', `First Name\n${lines}\n`);
      const result = await read(path);
      expect(result.rows).toEqual([]);
      expect(result.errors[0].code).toBe('TOO_MANY_ROWS');
    });

    it('reports an empty file and a header-only file', async () => {
      const empty = await read(await csvFile('zero.csv', ''));
      expect(empty.errors[0].code).toBe('EMPTY');
      const headerOnly = await read(await csvFile('head.csv', 'First Name\n'));
      expect(headerOnly.errors).toEqual([]);
      expect(headerOnly.rows).toEqual([]);
    });
  });

  describe('writeRows and XLSX round trip', () => {
    it('writes RFC 4180 CSV with BOM, CRLF and escaped quotes', () => {
      const csv = writeCsv(COLUMNS, [
        { firstName: 'Doe, "Jane"', phone: '=1+1', notes: 'a\nb', score: 7 },
      ]);
      expect(csv.startsWith(BOM)).toBe(true);
      expect(csv).toBe(
        `${BOM}First Name,Phone,Notes,Score\r\n"Doe, ""Jane""",'=1+1,"a\nb",7\r\n`,
      );
    });

    it('reads back what it wrote as XLSX, with numbers kept as text and formulas escaped', async () => {
      const file = await writeRows(
        COLUMNS,
        [
          { firstName: 'سارة', phone: '0501234567', notes: '+971', score: 12 },
          { firstName: 'Bob', phone: undefined, notes: undefined, score: null },
        ],
        'xlsx',
      );
      expect(file.contentType).toContain('spreadsheetml');
      const path = join(dir, 'round.xlsx');
      await writeFile(path, file.buffer);
      const result = await read(path);
      expect(result.errors).toEqual([]);
      expect(result.rows).toEqual([
        { firstName: 'سارة', phone: '0501234567', notes: '+971', score: '12' },
        {
          firstName: 'Bob',
          phone: undefined,
          notes: undefined,
          score: undefined,
        },
      ]);
    });

    it('rejects a zip with too many entries before reading it', async () => {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i <= ZIP_MAX_ENTRIES; i += 1) {
        files[`f${i}.txt`] = new Uint8Array([48]);
      }
      const path = join(dir, 'bomb.xlsx');
      await writeFile(path, Buffer.from(zipSync(files)));
      const result = await read(path);
      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'ZIP_LIMIT' }),
      ]);
    });
  });

  describe('cell sanitizing', () => {
    it('prefixes formula leads on export and strips one apostrophe on import', () => {
      for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
        expect(sanitizeForExport(`${lead}x`)).toBe(`'${lead}x`);
      }
      expect(sanitizeForExport('plain')).toBe('plain');
      expect(sanitizeForExport('+966 50 123 4567')).toBe('+966 50 123 4567');
      expect(sanitizeForExport('-5')).toBe('-5');
      expect(sanitizeForExport('+1 (555) 010-1234')).toBe('+1 (555) 010-1234');
      expect(sanitizeForExport('+cmd|calc')).toBe("'+cmd|calc");
      expect(sanitizeForExport('=1+1')).toBe("'=1+1");
      expect(sanitizeFromImport("''x")).toBe("'x");
      expect(sanitizeFromImport('x')).toBe('x');
    });
  });
});
