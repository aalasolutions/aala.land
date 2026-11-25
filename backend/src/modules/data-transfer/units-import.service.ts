import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Asset } from '../properties/entities/asset.entity';
import { Unit } from '../properties/entities/unit.entity';
import {
  assetsCacheKey,
  companyPlacesCacheKey,
} from '../properties/properties.service';
import { Locality } from '../locations/entities/locality.entity';
import { localitiesCacheKey } from '../locations/locations.service';
import { RedisService } from '../redis/redis.service';
import { UnitImportRowDto } from '../properties/transfer/unit-import-row.dto';
import {
  UNIT_COLUMNS,
  UNIT_EXPORT_ONLY_HEADERS,
} from '../properties/transfer/unit.columns';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import { withCompanyLock } from '@shared/utils/company-lock.util';
import { normalizePhone, phoneDigitsSql } from '@shared/utils/contact.util';
import {
  isUniqueViolation,
  normalizedNameSql,
  sanitizeName,
} from '@shared/utils/name-normalization.util';
import { readRows } from '@shared/spreadsheet/spreadsheet-reader';
import {
  chunks,
  FIRST_DATA_ROW,
  IMPORT_CHUNK,
  IMPORT_MAX_ROWS,
  summarize,
  toCommitResult,
  typeRows,
  type ImportPlan,
  type PlannedRow,
  type TypedRow,
} from './import-validation';
import { IMPORT_NO_FILE_MESSAGE, sniffImportFile } from './upload.util';
import type {
  CommitNote,
  CommitResult,
  EntityImporter,
} from './entity-importer';

interface ImportContext {
  companyId: string;
  userId: string;
  regions: string[];
}

interface ParsedUpload {
  fileName: string;
  plan?: ImportPlan;
  typed: TypedRow<UnitImportRowDto>[];
}

// Ids fill in stage by stage; a missing locality or asset id means commit creates it.
interface Decided {
  typed: TypedRow<UnitImportRowDto>;
  planned: PlannedRow;
  cityId?: string;
  localityId?: string;
  assetId?: string;
  ownerId?: string;
  unitId?: string;
}

// Parents whose cached child lists go stale once the transaction commits.
interface CreatedPlaces {
  cityIds: string[];
  localityIds: string[];
}

interface OwnerKey {
  kind: 'phone' | 'email';
  value: string;
  text: string;
}

export const OWNER_NOT_FOUND_REASON =
  'Owner not found, unit imported without owner.';
const CITY_NOT_FOUND_REASON = 'City not found.';
const CITY_AMBIGUOUS_REASON = 'City is in more than one of your regions.';
export const PLACE_TAKEN_MESSAGE =
  'A locality or asset in this file was created by someone else while importing. Nothing was imported; check the file and try again.';

@Injectable()
export class UnitsImportService implements EntityImporter {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly redis: RedisService,
  ) {}

  async preview(
    file: Express.Multer.File | undefined,
    user: JwtUserPayload,
    companyId: string,
  ): Promise<ImportPlan> {
    const context = await this.context(companyId, user);
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
  ): Promise<CommitResult> {
    const context = await this.context(companyId, user);
    const upload = await this.parseUpload(file);
    if (upload.plan) {
      throw new BadRequestException(
        upload.plan.fileErrors[0]?.message ?? 'The file could not be read.',
      );
    }
    const { decided, created } = await this.commitLocked(upload.typed, context);
    await this.forgetPlaces(created);
    const result = toCommitResult(decided.map((entry) => entry.planned));
    if (result.added > 0) {
      await this.redis.forget(companyPlacesCacheKey(companyId));
    }
    result.notes = decided.filter(isNoted).map(toNote);
    await this.auditService.log({
      companyId,
      userId: context.userId,
      action: AuditAction.IMPORT,
      entityType: 'Unit',
      regionCode: context.regions.length === 1 ? context.regions[0] : null,
      newValue: {
        added: result.added,
        skipped: result.skipped,
        failed: result.failed,
        notes: result.notes.length,
        fileName: upload.fileName,
      },
    });
    return result;
  }

  // The catalogue tables are global, so another company can take a name between the lookup and the insert; that aborts the whole commit.
  private async commitLocked(
    typed: TypedRow<UnitImportRowDto>[],
    context: ImportContext,
  ): Promise<{ decided: Decided[]; created: CreatedPlaces }> {
    try {
      return await withCompanyLock(
        this.dataSource,
        context.companyId,
        async (manager) => {
          const decided = await this.decide(typed, context, manager);
          const created = await this.createMissingPlaces(
            decided,
            context.companyId,
            manager,
          );
          await this.insert(decided, context, manager);
          return { decided, created };
        },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(PLACE_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  private async forgetPlaces(created: CreatedPlaces): Promise<void> {
    for (const cityId of created.cityIds) {
      await this.redis.forget(localitiesCacheKey(cityId));
    }
    for (const localityId of created.localityIds) {
      await this.redis.forget(assetsCacheKey(localityId));
    }
  }

  private async context(
    companyId: string,
    user: JwtUserPayload,
  ): Promise<ImportContext> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'activeRegions'],
    });
    return {
      companyId,
      userId: user.userId,
      regions: company?.activeRegions ?? [],
    };
  }

  private async parseUpload(
    file: Express.Multer.File | undefined,
  ): Promise<ParsedUpload> {
    if (!file) throw new BadRequestException(IMPORT_NO_FILE_MESSAGE);
    const fileName = file.originalname;
    const mime = await sniffImportFile(file);
    const read = await readRows(file.path, mime, UNIT_COLUMNS, {
      maxRows: IMPORT_MAX_ROWS,
      ignoreHeaders: UNIT_EXPORT_ONLY_HEADERS,
    });
    if (read.errors.length) {
      return {
        fileName,
        typed: [],
        plan: summarize(fileName, read.errors, []),
      };
    }
    const typed = await typeRows(read.rows, UNIT_COLUMNS, UnitImportRowDto);
    return { fileName, typed };
  }

  // Per row, the first problem wins: cell error, in-file duplicate, city, database duplicate; the owner lookup only adds a note.
  private async decide(
    typed: TypedRow<UnitImportRowDto>[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<Decided[]> {
    const { decided, candidates } = classifyRows(typed);
    await this.resolveCities(candidates, context.regions, manager);
    const placed = candidates.filter(isOpen);
    await this.resolveLocalities(placed, manager);
    await this.resolveAssets(placed, manager);
    await this.markExisting(placed, context.companyId, manager);
    await this.resolveOwners(placed.filter(isOpen), context.companyId, manager);
    return decided;
  }

  private async resolveCities(
    candidates: Decided[],
    regions: string[],
    manager: EntityManager,
  ): Promise<void> {
    const names = unique(
      candidates.map((entry) => nameKey(entry.typed.dto.city)),
    );
    const found = new Map<string, string[]>();
    for (const batch of chunks(names)) {
      const rows: { id: string; key: string }[] = await manager.query(
        `SELECT "id", ${normalizedNameSql('"name"')} AS key
           FROM "cities"
          WHERE "region_code" = ANY($1::text[])
            AND ${normalizedNameSql('"name"')} = ANY($2::text[])`,
        [regions, batch],
      );
      for (const row of rows) {
        found.set(row.key, [...(found.get(row.key) ?? []), row.id]);
      }
    }
    for (const entry of candidates) {
      const ids = found.get(nameKey(entry.typed.dto.city)) ?? [];
      if (ids.length === 1) {
        entry.cityId = ids[0];
      } else {
        fail(
          entry,
          'City',
          ids.length ? CITY_AMBIGUOUS_REASON : CITY_NOT_FOUND_REASON,
        );
      }
    }
  }

  private async resolveLocalities(
    candidates: Decided[],
    manager: EntityManager,
  ): Promise<void> {
    const found = await this.lookupNamed(
      manager,
      'localities',
      'city_id',
      candidates.map((entry) => [entry.cityId!, entry.typed.dto.locality]),
    );
    for (const entry of candidates) {
      entry.localityId = found.get(
        pairKey(entry.cityId!, entry.typed.dto.locality),
      );
    }
  }

  private async resolveAssets(
    candidates: Decided[],
    manager: EntityManager,
  ): Promise<void> {
    const located = candidates.filter((entry) => entry.localityId);
    const found = await this.lookupNamed(
      manager,
      'assets',
      'locality_id',
      located.map((entry) => [entry.localityId!, entry.typed.dto.asset]),
    );
    for (const entry of located) {
      entry.assetId = found.get(
        pairKey(entry.localityId!, entry.typed.dto.asset),
      );
    }
  }

  // Same normalized-name match as createLocality and createAsset, batched over parent id plus name.
  private async lookupNamed(
    manager: EntityManager,
    table: string,
    parentColumn: string,
    pairs: [string, string][],
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const parents = unique(pairs.map(([parent]) => parent));
    const names = unique(pairs.map(([, name]) => nameKey(name)));
    if (!parents.length) return found;
    for (const batch of chunks(names)) {
      const rows: { id: string; parent: string; key: string }[] =
        await manager.query(
          `SELECT "id", "${parentColumn}" AS parent, ${normalizedNameSql('"name"')} AS key
             FROM "${table}"
            WHERE "${parentColumn}" = ANY($1::uuid[])
              AND ${normalizedNameSql('"name"')} = ANY($2::text[])`,
          [parents, batch],
        );
      for (const row of rows) {
        const key = `${row.parent}|${row.key}`;
        if (!found.has(key)) found.set(key, row.id);
      }
    }
    return found;
  }

  // Duplicate key is asset plus unit number; archived units count, so an import never shadows one.
  private async markExisting(
    candidates: Decided[],
    companyId: string,
    manager: EntityManager,
  ): Promise<void> {
    const housed = candidates.filter((entry) => entry.assetId);
    const assets = unique(housed.map((entry) => entry.assetId!));
    const numbers = unique(housed.map((entry) => unitKey(entry.typed.dto)));
    const existing = new Set<string>();
    for (const batch of chunks(numbers)) {
      const rows: { asset_id: string; key: string }[] = await manager.query(
        `SELECT "asset_id", LOWER(BTRIM("unit_number")) AS key
           FROM "units"
          WHERE "company_id" = $1
            AND "asset_id" = ANY($2::uuid[])
            AND LOWER(BTRIM("unit_number")) = ANY($3::text[])`,
        [companyId, assets, batch],
      );
      for (const row of rows) existing.add(`${row.asset_id}|${row.key}`);
    }
    for (const entry of housed) {
      if (existing.has(`${entry.assetId}|${unitKey(entry.typed.dto)}`)) {
        skip(entry, `Already exists in ${sanitizeName(entry.typed.dto.asset)}`);
      }
    }
  }

  // Two batched lookups mirror ContactsService.findDuplicate: last nine phone digits, else lowercased email; a name alone is a miss.
  private async resolveOwners(
    candidates: Decided[],
    companyId: string,
    manager: EntityManager,
  ): Promise<void> {
    const keyed = candidates
      .map((entry) => ({ entry, key: ownerKey(entry.typed.dto) }))
      .filter((pair): pair is { entry: Decided; key: OwnerKey } => !!pair.key);
    const found = new Map<string, string>();
    const phones = unique(
      keyed.filter((p) => p.key.kind === 'phone').map((p) => p.key.value),
    );
    const emails = unique(
      keyed.filter((p) => p.key.kind === 'email').map((p) => p.key.value),
    );
    for (const batch of chunks(phones)) {
      const rows: { id: string; digits: string }[] = await manager.query(
        `SELECT "id", ${phoneDigitsSql('"phone"')} AS digits
           FROM "contacts"
          WHERE "company_id" = $1
            AND "phone" IS NOT NULL
            AND ${phoneDigitsSql('"phone"')} = ANY($2::text[])
          ORDER BY "created_at" ASC`,
        [companyId, batch],
      );
      for (const row of rows) {
        const key = `phone:${row.digits}`;
        if (!found.has(key)) found.set(key, row.id);
      }
    }
    for (const batch of chunks(emails)) {
      const rows: { id: string; email: string }[] = await manager.query(
        `SELECT "id", LOWER("email") AS email
           FROM "contacts"
          WHERE "company_id" = $1
            AND "email" IS NOT NULL
            AND LOWER("email") = ANY($2::text[])
          ORDER BY "created_at" ASC`,
        [companyId, batch],
      );
      for (const row of rows) {
        const key = `email:${row.email}`;
        if (!found.has(key)) found.set(key, row.id);
      }
    }
    for (const entry of candidates) {
      const key = ownerKey(entry.typed.dto);
      const ownerId = key ? found.get(key.text) : undefined;
      if (ownerId) {
        entry.ownerId = ownerId;
      } else if (key || hasOwnerCells(entry.typed.dto)) {
        entry.planned = {
          ...entry.planned,
          reason: OWNER_NOT_FOUND_REASON,
          values: entry.typed.raw,
        };
      }
    }
  }

  // decide() already matched names like createLocality and createAsset do, so what is still missing is inserted once per name on the same transaction.
  private async createMissingPlaces(
    rows: Decided[],
    companyId: string,
    manager: EntityManager,
  ): Promise<CreatedPlaces> {
    const adding = rows.filter(isOpen);
    const localities = groupBy(
      adding.filter((entry) => !entry.localityId),
      (entry) => pairKey(entry.cityId!, entry.typed.dto.locality),
    );
    const localityRepository = manager.getRepository(Locality);
    const savedLocalities = await localityRepository.save(
      localities.map((group) =>
        localityRepository.create({
          name: sanitizeName(group[0].typed.dto.locality),
          cityId: group[0].cityId!,
          createdByCompanyId: companyId,
        }),
      ),
    );
    savedLocalities.forEach((locality, index) => {
      for (const entry of localities[index]) entry.localityId = locality.id;
    });
    const assets = groupBy(
      adding.filter((entry) => !entry.assetId),
      (entry) => pairKey(entry.localityId!, entry.typed.dto.asset),
    );
    const assetRepository = manager.getRepository(Asset);
    const savedAssets = await assetRepository.save(
      assets.map((group) =>
        assetRepository.create({
          name: sanitizeName(group[0].typed.dto.asset),
          localityId: group[0].localityId!,
          createdByCompanyId: companyId,
        }),
      ),
    );
    savedAssets.forEach((asset, index) => {
      for (const entry of assets[index]) entry.assetId = asset.id;
    });
    return {
      cityIds: unique(savedLocalities.map((locality) => locality.cityId)),
      localityIds: unique(savedAssets.map((asset) => asset.localityId)),
    };
  }

  protected async insert(
    rows: Decided[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<Unit[]> {
    const repository = manager.getRepository(Unit);
    const adding = rows.filter(isOpen);
    const entities = adding.map((entry) => {
      const dto = entry.typed.dto;
      return repository.create({
        companyId: context.companyId,
        assetId: entry.assetId!,
        ownerId: entry.ownerId ?? null,
        unitNumber: dto.unitNumber,
        subType: dto.subType,
        status: dto.status,
        propertyType: dto.propertyType ?? null,
        price: dto.price ?? null,
        sqFt: dto.sqFt ?? null,
        bedrooms: dto.bedrooms ?? null,
        bathrooms: dto.bathrooms ?? null,
        floor: dto.floor ?? null,
        amenities: dto.amenities ?? [],
        description: dto.description ?? null,
      });
    });
    if (!entities.length) return [];
    const saved = await repository.save(entities, { chunk: IMPORT_CHUNK });
    saved.forEach((unit, index) => {
      adding[index].unitId = unit.id;
    });
    return saved;
  }
}

function isNoted(entry: Decided): boolean {
  return isOpen(entry) && Boolean(entry.planned.reason) && !!entry.unitId;
}

// The unit page route is locality, then unit.
function toNote(entry: Decided): CommitNote {
  return {
    id: entry.unitId!,
    row: entry.planned.row,
    values: entry.typed.raw,
    reason: entry.planned.reason!,
    parentIds: [entry.localityId!],
  };
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.values());
}

// Cell errors and in-file duplicates need no database; the survivors come back as candidates.
function classifyRows(typed: TypedRow<UnitImportRowDto>[]): {
  decided: Decided[];
  candidates: Decided[];
} {
  const decided: Decided[] = [];
  const candidates: Decided[] = [];
  const seen = new Map<string, number>();
  for (const row of typed) {
    const rowNumber = row.index + FIRST_DATA_ROW;
    const entry: Decided = {
      typed: row,
      planned: { row: rowNumber, status: 'add' },
    };
    decided.push(entry);
    if (row.problem) {
      fail(entry, row.problem.column, row.problem.reason);
      continue;
    }
    const key = fileKey(row.dto);
    const first = seen.get(key);
    if (first !== undefined) {
      skip(entry, `Duplicate of row ${first}`);
      continue;
    }
    seen.set(key, rowNumber);
    candidates.push(entry);
  }
  return { decided, candidates };
}

function hasOwnerCells(dto: UnitImportRowDto): boolean {
  return Boolean(
    dto.ownerFirstName || dto.ownerLastName || dto.ownerPhone || dto.ownerEmail,
  );
}

function ownerKey(dto: UnitImportRowDto): OwnerKey | null {
  const digits = normalizePhone(dto.ownerPhone);
  if (digits) return { kind: 'phone', value: digits, text: `phone:${digits}` };
  const email = dto.ownerEmail?.trim().toLowerCase();
  if (email) return { kind: 'email', value: email, text: `email:${email}` };
  return null;
}

function nameKey(name: string): string {
  return sanitizeName(name).toLowerCase();
}

function pairKey(parentId: string, name: string): string {
  return `${parentId}|${nameKey(name)}`;
}

function unitKey(dto: UnitImportRowDto): string {
  return dto.unitNumber.trim().toLowerCase();
}

function fileKey(dto: UnitImportRowDto): string {
  return [
    nameKey(dto.city),
    nameKey(dto.locality),
    nameKey(dto.asset),
    unitKey(dto),
  ].join('|');
}

function isOpen(entry: Decided): boolean {
  return entry.planned.status === 'add';
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function fail(entry: Decided, column: string, reason: string) {
  entry.planned = {
    ...entry.planned,
    status: 'error',
    column,
    reason,
    values: entry.typed.raw,
  };
}

function skip(entry: Decided, reason: string) {
  entry.planned = {
    ...entry.planned,
    status: 'skip',
    reason,
    values: entry.typed.raw,
  };
}
