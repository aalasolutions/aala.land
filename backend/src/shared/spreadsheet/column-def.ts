export type ColumnType = 'string' | 'number' | 'boolean' | 'enum';

export interface ParseOutcome {
  value?: unknown;
  error?: string;
}

// One column of an import or export file. Headers are what the user sees; keys are entity fields.
export interface ColumnDef {
  header: string;
  key: string;
  type: ColumnType;
  required?: boolean;
  requiredReason?: string;
  maxLength?: number;
  enumValues?: readonly string[];
  parse?: (raw: string) => ParseOutcome;
  format?: (value: unknown) => string;
}

export type FileErrorCode =
  | 'UNREADABLE'
  | 'EMPTY'
  | 'UNKNOWN_HEADER'
  | 'MISSING_HEADER'
  | 'DUPLICATE_HEADER'
  | 'TOO_MANY_ROWS'
  | 'ZIP_LIMIT';

export interface FileError {
  code: FileErrorCode;
  message: string;
  header?: string;
}

// Every cell is a trimmed string or undefined; typing happens later, per column.
export type RawRow = Record<string, string | undefined>;

export interface ReadResult {
  headers: string[];
  rows: RawRow[];
  errors: FileError[];
}

export type SpreadsheetFormat = 'csv' | 'xlsx';

export interface WrittenFile {
  buffer: Buffer;
  contentType: string;
  extension: SpreadsheetFormat;
}
