import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import type { ClassConstructor } from 'class-transformer';
import type {
  ColumnDef,
  FileError,
  RawRow,
} from '@shared/spreadsheet/column-def';
import type { CommitResult } from './entity-importer';

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_CHUNK = 500;

export type RowStatus = 'add' | 'skip' | 'error';

// Spreadsheet row numbers: the header is row 1, so the first data row is 2.
export const FIRST_DATA_ROW = 2;

export interface PlannedRow {
  row: number;
  status: RowStatus;
  column?: string;
  reason?: string;
  values?: RawRow;
}

export interface ImportPlan {
  fileName: string;
  willAdd: number;
  willSkip: number;
  failed: number;
  fileErrors: FileError[];
  rows: PlannedRow[];
}

export interface RowProblem {
  column: string;
  reason: string;
}

export interface TypedRow<T> {
  index: number;
  raw: RawRow;
  dto: T;
  problem?: RowProblem;
}

const CONSTRAINT_WORDS: Record<string, (constraint?: string) => string> = {
  maxLength: (constraint) => {
    const limit = constraint?.match(/(\d+)/)?.[1];
    return limit
      ? `Use at most ${limit} characters.`
      : 'This value is too long.';
  },
  isEmail: () => 'Enter a valid email address.',
  isBoolean: () => 'Use Yes or No.',
  isString: () => 'Enter text.',
  isNotEmpty: () => 'This cell is required.',
  isNumber: () => 'Enter a number.',
  isInt: () => 'Enter a whole number.',
  isEnum: () => 'Use one of the allowed values.',
  isHalfStep: () => 'Use a whole or half number, such as 2 or 2.5.',
  min: (constraint) => {
    const limit = constraint?.match(/(-?\d+(?:\.\d+)?)/)?.[1];
    return limit ? `Enter ${limit} or more.` : 'This value is too small.';
  },
  max: (constraint) => {
    const limit = constraint?.match(/(-?\d+(?:\.\d+)?)/)?.[1];
    return limit ? `Enter ${limit} or less.` : 'This value is too large.';
  },
  whitelistValidation: () => 'This column is not part of the template.',
};

// Turns a class-validator failure into words a spreadsheet user understands, with the column header.
export function describeViolation(
  error: ValidationError,
  columns: ColumnDef[],
): RowProblem {
  const column =
    columns.find((candidate) => candidate.key === error.property)?.header ??
    error.property;
  const constraints = error.constraints ?? {};
  const [key] = Object.keys(constraints);
  const words = key ? CONSTRAINT_WORDS[key] : undefined;
  return {
    column,
    reason: words ? words(constraints[key]) : 'Check this value.',
  };
}

// One pass per row: required cells, per-column parsers, then the entity DTO rules. The first problem wins.
export async function typeRows<T extends object>(
  rows: RawRow[],
  columns: ColumnDef[],
  dtoClass: ClassConstructor<T>,
): Promise<TypedRow<T>[]> {
  const typed: TypedRow<T>[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index];
    const parsed: Record<string, unknown> = {};
    let problem: RowProblem | undefined;
    for (const column of columns) {
      const cell = raw[column.key];
      if (cell === undefined) {
        if (column.required) {
          problem = {
            column: column.header,
            reason: column.requiredReason ?? 'This cell is required.',
          };
          break;
        }
        continue;
      }
      if (column.parse) {
        const outcome = column.parse(cell);
        if (outcome.error) {
          problem = { column: column.header, reason: outcome.error };
          break;
        }
        parsed[column.key] = outcome.value;
        continue;
      }
      parsed[column.key] = cell;
    }
    const dto = plainToInstance(dtoClass, parsed);
    if (!problem) {
      const violations = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (violations.length) {
        problem = describeViolation(violations[0], columns);
      }
    }
    typed.push({ index, raw, dto, problem });
  }
  return typed;
}

export function summarize(
  fileName: string,
  fileErrors: FileError[],
  rows: PlannedRow[],
): ImportPlan {
  let willAdd = 0;
  let willSkip = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === 'add') willAdd += 1;
    else if (row.status === 'skip') willSkip += 1;
    else failed += 1;
  }
  return { fileName, willAdd, willSkip, failed, fileErrors, rows };
}

// Added and skipped rows only count; error rows come back with their uploaded values and the reason.
export function toCommitResult(rows: PlannedRow[]): CommitResult {
  const result: CommitResult = {
    added: 0,
    skipped: 0,
    failed: 0,
    failedRows: [],
  };
  for (const planned of rows) {
    if (planned.status === 'add') {
      result.added += 1;
      continue;
    }
    if (planned.status === 'skip') {
      result.skipped += 1;
      continue;
    }
    result.failed += 1;
    result.failedRows.push({
      row: planned.row,
      values: planned.values ?? {},
      reason: planned.reason ?? '',
      column: planned.column,
    });
  }
  return result;
}

export function* chunks<T>(items: T[], size = IMPORT_CHUNK): Generator<T[]> {
  for (let start = 0; start < items.length; start += size) {
    yield items.slice(start, start + size);
  }
}
