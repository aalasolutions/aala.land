import { Injectable, NotFoundException } from '@nestjs/common';
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
  ContactsImportService,
  type CommitResult,
} from './contacts-import.service';
import type { ImportPlan } from './import-validation';
import type { FailedRowDto } from './dto/failed-file.dto';

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
    private readonly contactsImport: ContactsImportService,
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
    this.importable(entityName);
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    return this.contactsImport.preview(file, user, companyId, regionCode);
  }

  async commit(
    entityName: string,
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<CommitResult> {
    this.importable(entityName);
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.import);
    return this.contactsImport.commit(file, user, companyId, regionCode);
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
      rows.map((row) => ({ ...row.values, reason: row.reason })),
      format,
    );
    return { ...file, fileName: `${entity.fileStem}-not-imported.${format}` };
  }

  private importable(entityName: string): TransferEntity {
    const entity = transferEntity(entityName);
    if (!entity) {
      throw new NotFoundException('This kind of data cannot be imported.');
    }
    return entity;
  }

  private async activeRegions(companyId: string): Promise<string[]> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'activeRegions'],
    });
    return company?.activeRegions ?? [];
  }
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
