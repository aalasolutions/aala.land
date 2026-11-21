import type { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import type { RawRow } from '@shared/spreadsheet/column-def';
import type { ImportPlan } from './import-validation';

export interface FailedRow {
  row: number;
  values: RawRow;
  reason: string;
  column?: string;
}

// An inserted record worth a remark; parentIds are the detail route ids before its own, such as a unit's locality.
export interface CommitNote {
  id: string;
  row: number;
  values: RawRow;
  reason: string;
  parentIds: string[];
}

export interface CommitResult {
  added: number;
  skipped: number;
  failed: number;
  failedRows: FailedRow[];
  notes?: CommitNote[];
}

export interface EntityImporter {
  preview(
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<ImportPlan>;
  commit(
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<CommitResult>;
}

export type EntityImporters = Readonly<Record<string, EntityImporter>>;

export const ENTITY_IMPORTERS = Symbol('ENTITY_IMPORTERS');
