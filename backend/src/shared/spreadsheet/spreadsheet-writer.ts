import writeXlsxFile from 'write-excel-file/node';
import type { ColumnDef, SpreadsheetFormat, WrittenFile } from './column-def';
import { sanitizeForExport } from './cell-sanitize.util';

export const CONTENT_TYPES: Record<SpreadsheetFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export type ExportRow = Record<string, unknown>;

// Excel needs the byte order mark to open UTF-8 CSV with the right encoding.
const BOM = String.fromCharCode(0xfeff);

export interface ExtraSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

// Writes rows keyed by column key as CSV (own RFC 4180 writer) or XLSX. No source file outside shared/spreadsheet imports the library.
export async function writeRows(
  columns: ColumnDef[],
  rows: ExportRow[],
  format: SpreadsheetFormat,
  extraSheets: ExtraSheet[] = [],
): Promise<WrittenFile> {
  const buffer =
    format === 'xlsx'
      ? await writeXlsx(columns, rows, extraSheets)
      : Buffer.from(writeCsv(columns, rows), 'utf8');
  return { buffer, contentType: CONTENT_TYPES[format], extension: format };
}

export function writeCsv(columns: ColumnDef[], rows: ExportRow[]): string {
  const lines = [columns.map((column) => csvField(column.header)).join(',')];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => csvField(cellText(column, row[column.key])))
        .join(','),
    );
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

function csvField(value: string): string {
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function writeXlsx(
  columns: ColumnDef[],
  rows: ExportRow[],
  extraSheets: ExtraSheet[],
): Promise<Buffer> {
  const headerRow = columns.map((column) => ({
    value: column.header,
    fontWeight: 'bold' as const,
  }));
  const dataRows = rows.map((row) =>
    columns.map((column) => xlsxCell(column, row[column.key])),
  );
  const sheets = [
    { sheet: 'Data', data: [headerRow, ...dataRows] },
    ...extraSheets.map((sheet) => ({
      sheet: sheet.name,
      data: [
        sheet.headers.map((value) => ({ value, fontWeight: 'bold' as const })),
        ...sheet.rows.map((row) => row.map((value) => ({ value }))),
      ],
    })),
  ];
  return writeXlsxFile(sheets).toBuffer();
}

function xlsxCell(column: ColumnDef, value: unknown) {
  if (column.type === 'number' && typeof value === 'number') {
    return { value, type: Number };
  }
  const text = cellText(column, value);
  return text === '' ? {} : { value: text, type: String, format: '@' };
}

function cellText(column: ColumnDef, value: unknown): string {
  if (value === null || value === undefined) return '';
  const formatted = column.format
    ? column.format(value)
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : plainText(value);
  return column.type === 'number' ? formatted : sanitizeForExport(formatted);
}

function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}
