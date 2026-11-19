import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Contact } from '../entities/contact.entity';
import { ContactsService, type ContactFilters } from '../contacts.service';
import {
  ContactPrivacyService,
  type ContactViewer,
} from '../contact-privacy.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/dto/query-audit-logs.dto';
import { assertTier } from '@shared/utils/tier.util';
import { TRANSFER_TIERS } from '@shared/utils/transfer-tiers';
import {
  dateInZone,
  dateTimeInZone,
  regionTimezone,
} from '@shared/utils/region-time.util';
import type {
  ColumnDef,
  SpreadsheetFormat,
  WrittenFile,
} from '@shared/spreadsheet/column-def';
import { writeRows } from '@shared/spreadsheet/spreadsheet-writer';
import {
  CONTACT_COLUMNS,
  CONTACT_EXPORT_ONLY_COLUMNS,
} from './contact.columns';
import { ExportContactsQueryDto } from '../dto/export-contacts-query.dto';

// Batch and cap are mutable so a spec can prove the keyset walk on a small set.
export const EXPORT_LIMITS = { batch: 1000, cap: 20000 };

export const CONTACT_EXPORT_COLUMNS: ColumnDef[] = [
  ...CONTACT_COLUMNS,
  ...CONTACT_EXPORT_ONLY_COLUMNS,
];

export interface ContactExport extends WrittenFile {
  fileName: string;
  rows: number;
  truncated: boolean;
}

@Injectable()
export class ContactsExportService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly contactsService: ContactsService,
    private readonly contactPrivacy: ContactPrivacyService,
    private readonly auditService: AuditService,
  ) {}

  async export(
    companyId: string,
    viewer: ContactViewer,
    query: ExportContactsQueryDto,
  ): Promise<ContactExport> {
    await assertTier(this.companyRepository, companyId, TRANSFER_TIERS.export);
    const filters = toFilters(query);
    const { contacts, truncated } = await this.collect(
      companyId,
      viewer,
      query,
      filters,
    );
    const presented = await this.contactPrivacy.presentMany(
      companyId,
      viewer,
      contacts,
    );
    const rows = presented.map((contact) => ({
      ...contact,
      createdAt: dateTimeInZone(
        regionTimezone(contact.regionCode),
        contact.createdAt,
      ),
    }));
    const file = await writeRows(CONTACT_EXPORT_COLUMNS, rows, query.format);
    const scope =
      filters.allRegions || !filters.regionCode ? 'all' : filters.regionCode;
    const fileName = `contacts-${scope}-${dateInZone(regionTimezone(filters.regionCode))}.${query.format}`;
    await this.auditService.log({
      companyId,
      userId: viewer.userId,
      action: AuditAction.EXPORT,
      entityType: 'Contact',
      regionCode: filters.allRegions ? null : (filters.regionCode ?? null),
      newValue: { rows: rows.length, truncated, filters: auditFilters(query) },
    });
    return { ...file, fileName, rows: rows.length, truncated };
  }

  // Keyset walk in the list's order (newest first) with id as the tiebreaker; no OFFSET, no COUNT.
  private async collect(
    companyId: string,
    viewer: ContactViewer,
    query: ExportContactsQueryDto,
    filters: ContactFilters,
  ): Promise<{ contacts: Contact[]; truncated: boolean }> {
    const base = this.contactsService.exportQuery(
      companyId,
      query.search,
      query.tag,
      filters,
      viewer,
    );
    if (!base) return { contacts: [], truncated: false };

    const contacts: Contact[] = [];
    let cursor: { createdAt: Date; id: string } | null = null;
    for (;;) {
      const qb = base
        .clone()
        .orderBy('c.created_at', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .take(EXPORT_LIMITS.batch);
      if (cursor) {
        qb.andWhere('(c.created_at, c.id) < (:cursorAt, :cursorId)', {
          cursorAt: cursor.createdAt,
          cursorId: cursor.id,
        });
      }
      const batch = await qb.getMany();
      if (batch.length === 0) break;
      for (const contact of batch) {
        if (contacts.length >= EXPORT_LIMITS.cap) {
          return { contacts, truncated: true };
        }
        contacts.push(contact);
      }
      if (batch.length < EXPORT_LIMITS.batch) break;
      const last = batch[batch.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
    }
    return { contacts, truncated: false };
  }
}

// The list handler's parsing, applied to the export's query DTO.
export function toFilters(query: ExportContactsQueryDto): ContactFilters {
  return {
    agentId: query.agentId || undefined,
    isWhatsapp: query.isWhatsapp ? query.isWhatsapp === 'true' : undefined,
    company: query.company || undefined,
    companyExact: query.companyExact === 'true',
    nationality: query.nationality || undefined,
    regionCode: query.regionCode || undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    allRegions: query.allRegions === 'true',
  };
}

function auditFilters(query: ExportContactsQueryDto): Record<string, string> {
  const entries = Object.entries(query).filter(
    ([key, value]) => key !== 'format' && value !== undefined && value !== '',
  );
  return Object.fromEntries(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

export type { SpreadsheetFormat };
