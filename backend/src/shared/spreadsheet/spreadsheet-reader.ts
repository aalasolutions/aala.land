import { readFile } from 'node:fs/promises';
import { parse, CsvError } from 'csv-parse/sync';
import { unzipSync } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import type { ColumnDef, FileError, RawRow, ReadResult } from './column-def';
import { sanitizeFromImport } from './cell-sanitize.util';

export interface ReadOptions {
  maxRows: number;
  // Headers that may appear in the file and are dropped, such as export-only columns.
  ignoreHeaders?: readonly string[];
}

export const ZIP_MAX_ENTRIES = 20;
export const ZIP_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type Cell = string | boolean | Date | null | undefined;

// Reads a CSV or XLSX file into trimmed string rows keyed by column key. No source file outside shared/spreadsheet imports the libraries.
export async function readRows(
  path: string,
  mimeHint: string | undefined,
  columns: ColumnDef[],
  options: ReadOptions,
): Promise<ReadResult> {
  const data = await readFile(path);
  if (data.length === 0) {
    return failed('EMPTY', 'The file is empty.');
  }
  const isXlsx = data.subarray(0, 4).equals(ZIP_MAGIC) || isXlsxMime(mimeHint);
  const grid = isXlsx ? await readXlsxGrid(path, data) : readCsvGrid(data);
  if ('error' in grid) {
    return failed(grid.error.code, grid.error.message, grid.error.header);
  }
  return mapGrid(grid.cells, columns, options);
}

function isXlsxMime(mime: string | undefined): boolean {
  return (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function failed(
  code: FileError['code'],
  message: string,
  header?: string,
): ReadResult {
  return { headers: [], rows: [], errors: [{ code, message, header }] };
}

type Grid = { cells: Cell[][] } | { error: FileError };

// Decided once from the header line, so an unquoted ";" inside a cell of a comma file stays part of the cell.
function detectDelimiter(data: Buffer): ',' | ';' {
  const header = data.toString('utf8', 0, Math.min(data.length, 64 * 1024));
  const line = header.split(/\r?\n/, 1)[0];
  const commas = line.split(',').length - 1;
  const semicolons = line.split(';').length - 1;
  return semicolons > commas ? ';' : ',';
}

function readCsvGrid(data: Buffer): Grid {
  try {
    const cells = parse(data, {
      bom: true,
      delimiter: detectDelimiter(data),
      columns: false,
      skip_empty_lines: true,
      relax_column_count_less: true,
      trim: true,
    });
    return { cells };
  } catch (err) {
    const detail =
      err instanceof CsvError && typeof err.lines === 'number'
        ? ` (line ${err.lines})`
        : '';
    return {
      error: {
        code: 'UNREADABLE',
        message: `The file could not be read as CSV${detail}.`,
      },
    };
  }
}

async function readXlsxGrid(path: string, data: Buffer): Promise<Grid> {
  const limit = checkZipLimits(data);
  if (limit) return { error: limit };
  try {
    // Numbers stay text so phone numbers and leading zeros survive the round trip.
    const rows = await readSheet<string>(path, 1, {
      parseNumber: (text) => text,
    });
    return { cells: rows as unknown as Cell[][] };
  } catch {
    return {
      error: {
        code: 'UNREADABLE',
        message: 'The file could not be read as an Excel workbook.',
      },
    };
  }
}

// The central directory is read without inflating anything, so a zip bomb is refused before any decompression.
function checkZipLimits(data: Buffer): FileError | null {
  let entries = 0;
  let uncompressed = 0;
  try {
    unzipSync(new Uint8Array(data), {
      filter: (file) => {
        entries += 1;
        uncompressed += file.originalSize;
        return false;
      },
    });
  } catch {
    return {
      code: 'UNREADABLE',
      message: 'The file could not be read as an Excel workbook.',
    };
  }
  if (entries > ZIP_MAX_ENTRIES || uncompressed > ZIP_MAX_UNCOMPRESSED_BYTES) {
    return {
      code: 'ZIP_LIMIT',
      message: 'The workbook is larger than the import allows.',
    };
  }
  return null;
}

function mapGrid(
  cells: Cell[][],
  columns: ColumnDef[],
  options: ReadOptions,
): ReadResult {
  const [headerRow, ...bodyRows] = cells;
  if (!headerRow || headerRow.every((cell) => normalize(cell) === undefined)) {
    return failed('EMPTY', 'The file has no header row.');
  }
  const headers = headerRow.map((cell) => normalize(cell) ?? '');
  const ignored = options.ignoreHeaders ?? [];
  const errors = headerErrors(headers, columns, ignored);
  if (errors.length) {
    return { headers, rows: [], errors };
  }
  const body = bodyRows.filter((row) =>
    row.some((cell) => normalize(cell) !== undefined),
  );
  if (body.length > options.maxRows) {
    return {
      headers,
      rows: [],
      errors: [
        {
          code: 'TOO_MANY_ROWS',
          message: `The file has ${body.length} rows; the limit is ${options.maxRows}.`,
        },
      ],
    };
  }
  const keyByIndex = headers.map(
    (header) =>
      columns.find((column) => sameHeader(column.header, header))?.key ?? null,
  );
  const rows: RawRow[] = body.map((row) => {
    const record: RawRow = {};
    keyByIndex.forEach((key, index) => {
      if (key) record[key] = normalize(row[index]);
    });
    return record;
  });
  return { headers, rows, errors: [] };
}

function headerErrors(
  headers: string[],
  columns: ColumnDef[],
  ignored: readonly string[],
): FileError[] {
  const errors: FileError[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    if (header === '') continue;
    if (ignored.some((candidate) => sameHeader(candidate, header))) continue;
    const column = columns.find((candidate) =>
      sameHeader(candidate.header, header),
    );
    if (!column) {
      errors.push({
        code: 'UNKNOWN_HEADER',
        message: `Unknown column "${header}". Use the template headers.`,
        header,
      });
      continue;
    }
    if (seen.has(column.key)) {
      errors.push({
        code: 'DUPLICATE_HEADER',
        message: `Column "${column.header}" appears more than once.`,
        header: column.header,
      });
    }
    seen.add(column.key);
  }
  for (const column of columns) {
    if (column.required && !seen.has(column.key)) {
      errors.push({
        code: 'MISSING_HEADER',
        message: `Required column "${column.header}" is missing.`,
        header: column.header,
      });
    }
  }
  return errors;
}

function sameHeader(expected: string, actual: string): boolean {
  return expected.trim().toLowerCase() === actual.trim().toLowerCase();
}

// Every cell becomes a trimmed string; blanks become undefined so optional validators skip them.
function normalize(cell: Cell): string | undefined {
  if (cell === null || cell === undefined) return undefined;
  let text: string;
  if (cell instanceof Date) {
    text = isMidnightUtc(cell)
      ? cell.toISOString().slice(0, 10)
      : cell.toISOString();
  } else if (typeof cell === 'boolean') {
    text = cell ? 'TRUE' : 'FALSE';
  } else {
    text = String(cell);
  }
  text = sanitizeFromImport(text.trim());
  return text === '' ? undefined : text;
}

function isMidnightUtc(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}
