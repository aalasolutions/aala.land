import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import {
  ContactPrivacyService,
  type ContactViewer,
} from '../../contacts/contact-privacy.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/dto/query-audit-logs.dto';
import { assertTier } from '@shared/utils/tier.util';
import { TRANSFER_TIERS } from '@shared/utils/transfer-tiers';
import {
  dateInZone,
  dateTimeInZone,
  regionTimezone,
} from '@shared/utils/region-time.util';
import type { ColumnDef, WrittenFile } from '@shared/spreadsheet/column-def';
import { writeRows } from '@shared/spreadsheet/spreadsheet-writer';
import { getRegionByCode } from '@shared/constants/regions';
import { Unit } from '../entities/unit.entity';
import { PropertiesService, type UnitListFilters } from '../properties.service';
import { ExportUnitsQueryDto } from '../dto/export-units-query.dto';
import { toUnitFilters } from '../unit-filters.util';
import { UNIT_COLUMNS, UNIT_EXPORT_ONLY_COLUMNS } from './unit.columns';

// Batch and cap are mutable so a spec can prove the keyset walk on a small set.
export const EXPORT_LIMITS = { batch: 1000, cap: 20000 };

export const UNIT_EXPORT_COLUMNS: ColumnDef[] = [
  ...UNIT_COLUMNS,
  ...UNIT_EXPORT_ONLY_COLUMNS,
];

export interface UnitExport extends WrittenFile {
  fileName: string;
  rows: number;
  truncated: boolean;
}

// Decimal columns arrive as strings from the driver; the sheet gets real numbers.
function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

@Injectable()
export class UnitsExportService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly propertiesService: PropertiesService,
    private readonly contactPrivacy: ContactPrivacyService,
    private readonly auditService: AuditService,
  ) {}

  async export(
    companyId: string,
    viewer: ContactViewer,
    query: ExportUnitsQueryDto,
  ): Promise<UnitExport> {
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.export);
    const filters = toUnitFilters(query);
    const { units, truncated } = await this.collect(companyId, viewer, filters);
    const owners = units
      .map((unit) => unit.owner)
      .filter((owner): owner is Contact => !!owner);
    const ownerLevels = await this.contactPrivacy.accessLevelFor(
      companyId,
      viewer,
      owners,
    );
    const rows = units.map((unit) => {
      const city = unit.asset?.locality?.city;
      const owner =
        unit.owner && ownerLevels.get(unit.owner.id) === 'FULL'
          ? unit.owner
          : null;
      return {
        city: city?.name ?? '',
        locality: unit.asset?.locality?.name ?? '',
        asset: unit.asset?.name ?? '',
        unitNumber: unit.unitNumber,
        subType: unit.subType,
        status: unit.status,
        propertyType: unit.propertyType,
        price: toNumber(unit.price),
        sqFt: toNumber(unit.sqFt),
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        floor: unit.floor,
        amenities: unit.amenities ?? [],
        description: unit.description,
        ownerFirstName: owner?.firstName ?? null,
        ownerLastName: owner?.lastName ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerEmail: owner?.email ?? null,
        createdAt: dateTimeInZone(
          regionTimezone(city?.regionCode),
          unit.createdAt,
        ),
      };
    });
    const file = await writeRows(UNIT_EXPORT_COLUMNS, rows, query.format);
    // Only a known region code names the file; the query string itself never reaches a header.
    const known = filters.regionCode && getRegionByCode(filters.regionCode);
    const scope = known ? known.code : 'all';
    const fileName = `units-${scope}-${dateInZone(regionTimezone(filters.regionCode))}.${query.format}`;
    await this.auditService.log({
      companyId,
      userId: viewer.userId,
      action: AuditAction.EXPORT,
      entityType: 'Unit',
      regionCode: filters.regionCode ?? null,
      newValue: { rows: rows.length, truncated, filters: auditFilters(query) },
    });
    return { ...file, fileName, rows: rows.length, truncated };
  }

  // Keyset walk newest first with id as the tiebreaker; no OFFSET, no COUNT.
  private async collect(
    companyId: string,
    viewer: ContactViewer,
    filters: UnitListFilters,
  ): Promise<{ units: Unit[]; truncated: boolean }> {
    const base = this.propertiesService.exportQuery(companyId, filters, viewer);
    if (!base) return { units: [], truncated: false };

    const units: Unit[] = [];
    // created_at has microseconds and a JS Date has milliseconds, so the cursor stays database text.
    let cursor: { createdAt: string; id: string } | null = null;
    for (;;) {
      // Every join is to-one, so one row is one unit and LIMIT needs no second query.
      const qb = base
        .clone()
        .addSelect('u.created_at::text', 'cursor_at')
        .orderBy('u.created_at', 'DESC')
        .addOrderBy('u.id', 'DESC')
        .limit(EXPORT_LIMITS.batch);
      if (cursor) {
        qb.andWhere(
          '(u.created_at, u.id) < (:cursorAt::timestamptz, :cursorId)',
          { cursorAt: cursor.createdAt, cursorId: cursor.id },
        );
      }
      const { entities: batch, raw } = await qb.getRawAndEntities<{
        cursor_at: string;
      }>();
      if (batch.length === 0) break;
      for (const unit of batch) {
        if (units.length >= EXPORT_LIMITS.cap) {
          return { units, truncated: true };
        }
        units.push(unit);
      }
      if (batch.length < EXPORT_LIMITS.batch) break;
      const last = batch[batch.length - 1];
      cursor = { createdAt: raw[raw.length - 1].cursor_at, id: last.id };
    }
    return { units, truncated: false };
  }
}

function auditFilters(query: ExportUnitsQueryDto): Record<string, string> {
  const entries = Object.entries(query).filter(
    ([key, value]) => key !== 'format' && value !== undefined && value !== '',
  );
  return Object.fromEntries(
    entries.map(([key, value]) => [key, String(value)]),
  );
}
