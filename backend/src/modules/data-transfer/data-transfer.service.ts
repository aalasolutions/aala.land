import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { assertTier } from '@shared/utils/tier.util';
import { TRANSFER_TIERS } from '@shared/utils/transfer-tiers';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import type {
  ColumnDef,
  SpreadsheetFormat,
  WrittenFile,
} from '@shared/spreadsheet/column-def';
import {
  writeRows,
  type ExtraSheet,
} from '@shared/spreadsheet/spreadsheet-writer';
import { transferEntity, type TransferEntity } from './transfer-entities';
import {
  ENTITY_IMPORTERS,
  type CommitResult,
  type EntityImporter,
  type EntityImporters,
} from './entity-importer';
import type { ImportPlan } from './import-validation';
import type { FailedRowDto } from './dto/failed-file.dto';
import type { NoteRowDto } from './dto/notes-file.dto';

export { TRANSFER_TIERS };

export interface TemplateFile extends WrittenFile {
  fileName: string;
}

const REASON_COLUMN: ColumnDef = {
  header: 'Reason',
  key: 'reason',
  type: 'string',
};

@Injectable()
export class DataTransferService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @Inject(ENTITY_IMPORTERS)
    private readonly importers: EntityImporters,
  ) {}

  async templateFile(
    entityName: string,
    companyId: string,
    format: SpreadsheetFormat,
  ): Promise<TemplateFile> {
    const entity = this.importable(entityName);
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    const regions = await this.activeRegions(companyId);
    const example = { ...entity.example };
    if ('regionCode' in example && regions.length === 1) {
      example.regionCode = regions[0];
    }
    const file = await writeRows(
      entity.columns,
      [example],
      format,
      format === 'xlsx' ? [allowedValuesSheet(entity.columns, regions)] : [],
    );
    return { ...file, fileName: `${entity.fileStem}-template.${format}` };
  }

  async preview(
    entityName: string,
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<ImportPlan> {
    const importer = this.importer(entityName);
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    return importer.preview(file, user, companyId, regionCode);
  }

  async commit(
    entityName: string,
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<CommitResult> {
    const importer = this.importer(entityName);
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    return importer.commit(file, user, companyId, regionCode);
  }

  // Stateless: the failed rows come back from the browser and leave as a file with a Reason column.
  async failedFile(
    entityName: string,
    companyId: string,
    rows: FailedRowDto[],
    format: SpreadsheetFormat,
  ): Promise<TemplateFile> {
    const entity = this.importable(entityName);
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    const columns = [...entity.columns, REASON_COLUMN];
    const file = await writeRows(
      columns,
      rows.map((row) => ({ ...row.values, reason: fileReason(row) })),
      format,
    );
    return { ...file, fileName: `${entity.fileStem}-not-imported.${format}` };
  }

  // Stateless like failedFile: the browser sends the note cells it showed, link included, and gets them back as a file.
  async notesFile(
    entityName: string,
    companyId: string,
    rows: NoteRowDto[],
    format: SpreadsheetFormat,
  ): Promise<TemplateFile> {
    const notes = this.importable(entityName).notes;
    if (!notes) {
      throw new NotFoundException('This kind of data has no notes file.');
    }
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    const file = await writeRows(
      [...notes.columns, REASON_COLUMN],
      rows.map((row) => ({ ...row.values, reason: row.reason })),
      format,
    );
    return { ...file, fileName: `${notes.fileStem}.${format}` };
  }

  private importable(entityName: string): TransferEntity {
    const entity = transferEntity(entityName);
    if (!entity) {
      throw new NotFoundException('This kind of data cannot be imported.');
    }
    return entity;
  }

  private importer(entityName: string): EntityImporter {
    this.importable(entityName);
    return this.importers[entityName];
  }

  private async activeRegions(companyId: string): Promise<string[]> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'activeRegions'],
    });
    return company?.activeRegions ?? [];
  }
}

// The file has no Column cell, so a column-scoped reason carries its header.
function fileReason(row: FailedRowDto): string {
  return row.column ? `${row.column}: ${row.reason}` : row.reason;
}

// XLSX carries the allowed values on a second sheet; CSV cannot, so its example row shows valid values.
function allowedValuesSheet(
  columns: ColumnDef[],
  regions: string[],
): ExtraSheet {
  const rows: string[][] = [];
  for (const column of columns) {
    const values =
      column.key === 'regionCode' ? regions : (column.enumValues ?? []);
    for (const value of values) {
      rows.push([column.header, value]);
    }
  }
  return { name: 'Allowed values', headers: ['Column', 'Value'], rows };
}
