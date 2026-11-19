import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { CreateContactDto } from '../contacts/dto/create-contact.dto';
import {
  CONTACT_COLUMNS,
  CONTACT_EXPORT_ONLY_HEADERS,
} from '../contacts/transfer/contact.columns';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import { withCompanyLock } from '@shared/utils/company-lock.util';
import { normalizePhone, phoneDigitsSql } from '@shared/utils/contact.util';
import { getRegionByCode } from '@shared/constants/regions';
import type { RawRow } from '@shared/spreadsheet/column-def';
import { readRows } from '@shared/spreadsheet/spreadsheet-reader';
import {
  FIRST_DATA_ROW,
  IMPORT_MAX_ROWS,
  summarize,
  typeRows,
  type ImportPlan,
  type PlannedRow,
  type TypedRow,
} from './import-validation';
import {
  discardUpload,
  IMPORT_NO_FILE_MESSAGE,
  sniffImportFile,
} from './upload.util';

export interface FailedRow {
  row: number;
  values: RawRow;
  reason: string;
  column?: string;
}

export interface CommitResult {
  added: number;
  skipped: number;
  failed: number;
  failedRows: FailedRow[];
}

interface ImportContext {
  companyId: string;
  userId: string;
  regions: string[];
  requestRegion?: string;
}

interface ParsedUpload {
  fileName: string;
  plan?: ImportPlan;
  typed: TypedRow<CreateContactDto>[];
}

interface Decided {
  typed: TypedRow<CreateContactDto>;
  planned: PlannedRow;
  region?: string;
}

const REGION_HEADER = 'Region';
const IDENTITY_REASON = 'Enter a first name, phone or email.';
const CHUNK = 500;

@Injectable()
export class ContactsImportService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async preview(
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<ImportPlan> {
    const context = await this.context(companyId, user, regionCode);
    const upload = await this.parseUpload(file);
    if (upload.plan) return upload.plan;
    const decided = await this.decide(
      upload.typed,
      context,
      this.dataSource.manager,
    );
    return summarize(
      upload.fileName,
      [],
      decided.map((entry) => entry.planned),
    );
  }

  // Validation runs again inside the company lock, so a parallel commit of the same file cannot double insert.
  async commit(
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
    regionCode: string | undefined,
  ): Promise<CommitResult> {
    const context = await this.context(companyId, user, regionCode);
    const upload = await this.parseUpload(file);
    if (upload.plan) {
      throw new BadRequestException(
        upload.plan.fileErrors[0]?.message ?? 'The file could not be read.',
      );
    }
    const decided = await withCompanyLock(
      this.dataSource,
      companyId,
      async (manager) => {
        const rows = await this.decide(upload.typed, context, manager);
        const inserted = await this.insert(rows, context, manager);
        await this.relinkChats(manager, companyId, inserted);
        return rows;
      },
    );
    const result = toCommitResult(decided);
    await this.auditService.log({
      companyId,
      userId: context.userId,
      action: AuditAction.IMPORT,
      entityType: 'Contact',
      regionCode: context.requestRegion ?? singleRegion(context.regions),
      newValue: {
        added: result.added,
        skipped: result.skipped,
        failed: result.failed,
        fileName: upload.fileName,
      },
    });
    return result;
  }

  private async context(
    companyId: string,
    user: JwtUserPayload,
    regionCode: string | undefined,
  ): Promise<ImportContext> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'activeRegions'],
    });
    const regions = company?.activeRegions ?? [];
    let requestRegion: string | undefined;
    if (regionCode) {
      requestRegion = matchRegion(regions, regionCode);
      if (!requestRegion) {
        throw new BadRequestException(
          'Choose one of your company’s active regions.',
        );
      }
    }
    return { companyId, userId: user.userId, regions, requestRegion };
  }

  private async parseUpload(
    file: Express.Multer.File | undefined,
  ): Promise<ParsedUpload> {
    if (!file) throw new BadRequestException(IMPORT_NO_FILE_MESSAGE);
    const fileName = file.originalname;
    try {
      const mime = await sniffImportFile(file);
      const read = await readRows(file.path, mime, CONTACT_COLUMNS, {
        maxRows: IMPORT_MAX_ROWS,
        ignoreHeaders: CONTACT_EXPORT_ONLY_HEADERS,
      });
      if (read.errors.length) {
        return {
          fileName,
          typed: [],
          plan: summarize(fileName, read.errors, []),
        };
      }
      const typed = await typeRows(
        read.rows,
        CONTACT_COLUMNS,
        CreateContactDto,
      );
      return { fileName, typed };
    } finally {
      await discardUpload(file);
    }
  }

  // One decision per row, in file order: error, then in-file duplicate, then database duplicate, else add.
  private async decide(
    typed: TypedRow<CreateContactDto>[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<Decided[]> {
    const decided: Decided[] = [];
    const candidates: { entry: Decided; key: DuplicateKey }[] = [];
    const seen = new Map<string, number>();

    for (const row of typed) {
      const rowNumber = row.index + FIRST_DATA_ROW;
      const entry: Decided = {
        typed: row,
        planned: { row: rowNumber, status: 'add' },
      };
      decided.push(entry);
      const problem = row.problem ?? identityProblem(row.dto);
      if (problem) {
        fail(entry, problem.column, problem.reason, row.raw);
        continue;
      }
      const region = resolveRegion(row.raw.regionCode, context);
      if (!region.code) {
        fail(entry, REGION_HEADER, region.reason!, row.raw);
        continue;
      }
      entry.region = region.code;
      const key = duplicateKey(row.dto);
      if (!key) continue;
      const first = seen.get(key.text);
      if (first !== undefined) {
        skip(entry, `Duplicate of row ${first}`, row.raw);
        continue;
      }
      seen.set(key.text, rowNumber);
      candidates.push({ entry, key });
    }

    const existing = await this.existingKeys(
      candidates.map((c) => c.key),
      context.companyId,
      manager,
    );
    for (const { entry, key } of candidates) {
      const region = existing.get(key.text);
      if (region !== undefined) {
        skip(
          entry,
          `Already exists in ${regionLabel(region)}`,
          entry.typed.raw,
        );
      }
    }
    return decided;
  }

  // Two batched lookups mirror ContactsService.findDuplicate: last nine phone digits, else lowercased email.
  private async existingKeys(
    keys: DuplicateKey[],
    companyId: string,
    manager: EntityManager,
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const phones = keys.filter((k) => k.kind === 'phone').map((k) => k.value);
    const emails = keys.filter((k) => k.kind === 'email').map((k) => k.value);
    for (const batch of chunks(phones)) {
      const rows: { digits: string; region_code: string }[] =
        await manager.query(
          `SELECT ${phoneDigitsSql('"phone"')} AS digits, "region_code"
             FROM "contacts"
            WHERE "company_id" = $1
              AND "phone" IS NOT NULL
              AND ${phoneDigitsSql('"phone"')} = ANY($2::text[])`,
          [companyId, batch],
        );
      for (const row of rows) found.set(`phone:${row.digits}`, row.region_code);
    }
    for (const batch of chunks(emails)) {
      const rows: { email: string; region_code: string }[] =
        await manager.query(
          `SELECT LOWER("email") AS email, "region_code"
             FROM "contacts"
            WHERE "company_id" = $1
              AND "email" IS NOT NULL
              AND LOWER("email") = ANY($2::text[])`,
          [companyId, batch],
        );
      for (const row of rows) found.set(`email:${row.email}`, row.region_code);
    }
    return found;
  }

  private async insert(
    decided: Decided[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<Contact[]> {
    const repository = manager.getRepository(Contact);
    const entities = decided
      .filter((entry) => entry.planned.status === 'add')
      .map((entry) =>
        repository.create({
          companyId: context.companyId,
          createdBy: context.userId,
          regionCode: entry.region!,
          firstName: entry.typed.dto.firstName ?? null,
          lastName: entry.typed.dto.lastName ?? null,
          phone: entry.typed.dto.phone ?? null,
          email: entry.typed.dto.email ?? null,
          isWhatsapp: entry.typed.dto.isWhatsapp ?? false,
          nationality: entry.typed.dto.nationality ?? null,
          nationalId: entry.typed.dto.nationalId ?? null,
          contactCompany: entry.typed.dto.contactCompany ?? null,
          jobTitle: entry.typed.dto.jobTitle ?? null,
          address: entry.typed.dto.address ?? null,
          notes: entry.typed.dto.notes ?? null,
        }),
      );
    if (!entities.length) return [];
    return repository.save(entities, { chunk: CHUNK });
  }

  // Same matching as ContactsService.linkMatchingChats, one UPDATE per chunk of inserted contacts.
  protected async relinkChats(
    manager: EntityManager,
    companyId: string,
    contacts: Contact[],
  ): Promise<void> {
    const pairs = contacts
      .map((contact) => ({
        id: contact.id,
        digits: normalizePhone(contact.phone),
      }))
      .filter((pair): pair is { id: string; digits: string } => !!pair.digits);
    for (const batch of chunks(pairs)) {
      const values = batch
        .map((_, index) => `($${index * 2 + 2}::uuid, $${index * 2 + 3})`)
        .join(', ');
      const params = [
        companyId,
        ...batch.flatMap((pair) => [pair.id, pair.digits]),
      ];
      await manager.query(
        `UPDATE "whatsapp_chats" AS c
            SET "contact_id" = v.id,
                "contact_resolution_attempted" = false
           FROM (VALUES ${values}) AS v(id, digits)
          WHERE c."company_id" = $1
            AND COALESCE(c."is_group", false) = false
            AND RIGHT(
                  regexp_replace(
                    split_part(split_part(c."chat_id", '@', 1), ':', 1),
                    '\\D', '', 'g'
                  ),
                  9
                ) = v.digits`,
        params,
      );
    }
  }
}

interface DuplicateKey {
  kind: 'phone' | 'email';
  value: string;
  text: string;
}

function duplicateKey(dto: CreateContactDto): DuplicateKey | null {
  const digits = normalizePhone(dto.phone);
  if (digits) return { kind: 'phone', value: digits, text: `phone:${digits}` };
  const email = dto.email?.trim().toLowerCase();
  if (email) return { kind: 'email', value: email, text: `email:${email}` };
  return null;
}

function identityProblem(dto: CreateContactDto) {
  if (dto.firstName || dto.phone || dto.email) return undefined;
  return { column: 'First Name', reason: IDENTITY_REASON };
}

function resolveRegion(
  cell: string | undefined,
  context: ImportContext,
): { code?: string; reason?: string } {
  if (cell) {
    const code = matchRegion(context.regions, cell);
    return code ? { code } : { reason: 'Not one of your company’s regions.' };
  }
  if (context.requestRegion) return { code: context.requestRegion };
  if (context.regions.length === 1) return { code: context.regions[0] };
  return { reason: 'Choose a region.' };
}

function matchRegion(regions: string[], wanted: string): string | undefined {
  const lower = wanted.trim().toLowerCase();
  return regions.find((code) => code.toLowerCase() === lower);
}

function singleRegion(regions: string[]): string | null {
  return regions.length === 1 ? regions[0] : null;
}

function regionLabel(code: string): string {
  return getRegionByCode(code)?.name ?? code;
}

function fail(entry: Decided, column: string, reason: string, values: RawRow) {
  entry.planned = { ...entry.planned, status: 'error', column, reason, values };
}

function skip(entry: Decided, reason: string, values: RawRow) {
  entry.planned = { ...entry.planned, status: 'skip', reason, values };
}

function toCommitResult(decided: Decided[]): CommitResult {
  const result: CommitResult = {
    added: 0,
    skipped: 0,
    failed: 0,
    failedRows: [],
  };
  for (const { planned } of decided) {
    if (planned.status === 'add') {
      result.added += 1;
      continue;
    }
    if (planned.status === 'skip') result.skipped += 1;
    else result.failed += 1;
    result.failedRows.push({
      row: planned.row,
      values: planned.values ?? {},
      reason: planned.reason ?? '',
      column: planned.column,
    });
  }
  return result;
}

function* chunks<T>(items: T[]): Generator<T[]> {
  for (let start = 0; start < items.length; start += CHUNK) {
    yield items.slice(start, start + CHUNK);
  }
}
