import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { clampLimit, pageSkip } from '@shared/utils/pagination.util';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { Company } from '../companies/entities/company.entity';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import { Lead } from '../leads/entities/lead.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WhatsappChat } from '../whatsapp/entities/whatsapp-chat.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { DeleteContactDto } from './dto/delete-contact.dto';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import {
  contactDisplayName,
  emailEqualsWhere,
  normalizePhone,
  phoneDigitsWhere,
} from '../../shared/utils/contact.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';
import { isDateOnly } from '../../shared/utils/region-time.util';

// Derived role tags; never stored on the contact, computed from which rows reference it.
export type ContactTag = 'lead' | 'tenant' | 'owner' | 'vendor';

export type ContactResponse = Omit<Contact, 'company'> & {
  displayName: string | null;
  tags: ContactTag[];
};

// Additional list filters beyond search and role tag.
export interface ContactFilters {
  agentId?: string;
  isWhatsapp?: boolean;
  company?: string;
  nationality?: string;
  dateFrom?: string;
  dateTo?: string;
  regionCode?: string;
}

// Identity carried inline attaching a person: existing contact id, or details to resolve/create.
export interface ContactIdentity {
  contactId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  isWhatsapp?: boolean | null;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly recordHistoryService: RecordHistoryService,
  ) {}

  // One-number-one-contact: an existing number resolves to it and fills empty fields, no duplicate.
  async create(
    companyId: string,
    dto: CreateContactDto,
    createdBy: string,
    caller: RegionScope,
  ): Promise<ContactResponse> {
    const phoneKey = normalizePhone(dto.phone);
    let existing: Contact | null = null;
    if (phoneKey) {
      existing = await this.contactRepository.findOne({
        where: { companyId, phone: phoneDigitsWhere(dto.phone) },
      });
    } else if (dto.email) {
      existing = await this.contactRepository.findOne({
        where: { companyId, email: emailEqualsWhere(dto.email) },
      });
    }
    if (existing) {
      const merged = await this.mergeEmpty(existing, dto);
      return this.findOne(merged.id, companyId);
    }

    const regionCode = await resolveRegionCode(
      this.companyRepository,
      companyId,
      dto.regionCode,
      caller,
    );
    const contact = this.contactRepository.create({
      ...dto,
      companyId,
      createdBy,
      regionCode,
    });
    const saved = await this.contactRepository.save(contact);
    await this.linkMatchingChats(saved);
    return this.findOne(saved.id, companyId);
  }

  // Matches last 9 digits or lowercased email, fills empty fields; regionCode defaults to company.
  async resolveOrCreate(
    companyId: string,
    identity: ContactIdentity,
    createdBy?: string,
    regionCode?: string,
  ): Promise<Contact> {
    if (identity.contactId) {
      const existing = await this.contactRepository.findOne({
        where: { id: identity.contactId, companyId },
      });
      if (!existing) {
        throw new BadRequestException('Contact not found');
      }
      return existing;
    }

    const phoneKey = normalizePhone(identity.phone);
    if (phoneKey) {
      const match = await this.contactRepository.findOne({
        where: { companyId, phone: phoneDigitsWhere(identity.phone) },
      });
      if (match) {
        return this.mergeEmpty(match, {
          firstName: identity.firstName,
          lastName: identity.lastName,
          email: identity.email,
          phone: identity.phone,
          isWhatsapp: identity.isWhatsapp ?? undefined,
        });
      }
    } else if (identity.email) {
      const match = await this.contactRepository.findOne({
        where: {
          companyId,
          email: emailEqualsWhere(identity.email),
        },
      });
      if (match) {
        return this.mergeEmpty(match, {
          firstName: identity.firstName,
          lastName: identity.lastName,
          email: identity.email,
          phone: identity.phone,
          isWhatsapp: identity.isWhatsapp ?? undefined,
        });
      }
    }

    const contact = this.contactRepository.create({
      companyId,
      createdBy: createdBy ?? null,
      regionCode: await resolveRegionCode(
        this.companyRepository,
        companyId,
        regionCode,
      ),
      firstName: identity.firstName || null,
      lastName: identity.lastName || null,
      email: identity.email || null,
      phone: identity.phone || null,
      isWhatsapp: identity.isWhatsapp ?? false,
    });
    const saved = await this.contactRepository.save(contact);
    await this.linkMatchingChats(saved);
    return saved;
  }

  // Only empty fields are filled from the input; existing data is never overwritten.
  private async mergeEmpty(
    existing: Contact,
    input: Partial<Record<keyof Contact, string | boolean | null>>,
  ): Promise<Contact> {
    let changed = false;
    const textFields: (keyof Contact)[] = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'nationality',
      'nationalId',
      'contactCompany',
      'jobTitle',
      'address',
      'notes',
    ];
    for (const key of textFields) {
      const v = input[key as keyof Partial<CreateContactDto>];
      if (v && !existing[key]) {
        (existing as unknown as Record<string, unknown>)[key as string] = v;
        changed = true;
      }
    }
    // isWhatsapp upgrades true->true; never downgrades an existing true.
    if (input.isWhatsapp && !existing.isWhatsapp) {
      existing.isWhatsapp = true;
      changed = true;
    }
    if (!changed) return existing;
    const saved = await this.contactRepository.save(existing);
    // A phone may have just been filled: re-link chats that were waiting on it.
    await this.linkMatchingChats(saved);
    return saved;
  }

  // Clears the attempted latch: resolver never retries once true; this unblocks a stale chat.
  private async linkMatchingChats(contact: Contact): Promise<void> {
    const digits = normalizePhone(contact.phone);
    if (!digits) return;
    await this.chatRepository.query(
      `UPDATE "whatsapp_chats"
          SET "contact_id" = $1,
              "contact_resolution_attempted" = false
        WHERE "company_id" = $2
          AND COALESCE("is_group", false) = false
          AND RIGHT(
                regexp_replace(
                  split_part(split_part("chat_id", '@', 1), ':', 1),
                  '\\D', '', 'g'
                ),
                9
              ) = $3`,
      [contact.id, contact.companyId, digits],
    );
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    search?: string,
    tag?: ContactTag,
    filters?: ContactFilters,
    caller?: RegionScope,
  ): Promise<{
    data: ContactResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const regionCodes = effectiveRegionCodes(filters?.regionCode, caller);
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const qb = this.contactRepository
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId });

    if (regionCodes) {
      qb.andWhere('c.region_code IN (:...regionCodes)', { regionCodes });
    }

    if (search) {
      qb.andWhere(
        `(c.first_name ILIKE :s OR c.last_name ILIKE :s OR c.email ILIKE :s OR c.phone ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    if (tag) {
      // companyId bound on the qb; EXISTS subqueries reuse it, keeping role checks company-scoped.
      qb.andWhere(this.tagExistsSql('c.id', tag));
    }

    if (filters?.agentId) {
      // Agent assigned via a lead OR a unit this contact owns; both scoped via bound :companyId.
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = c.id AND l.company_id = :companyId AND l.assigned_to = :agentId)
          OR EXISTS (SELECT 1 FROM units u WHERE u.owner_id = c.id AND u.company_id = :companyId AND u.assigned_agent_id = :agentId AND u.deleted_at IS NULL))`,
        { agentId: filters.agentId },
      );
    }

    if (filters?.isWhatsapp !== undefined) {
      qb.andWhere('c.is_whatsapp = :isWhatsapp', {
        isWhatsapp: filters.isWhatsapp,
      });
    }

    if (filters?.company) {
      qb.andWhere('c.contact_company ILIKE :company', {
        company: `%${filters.company}%`,
      });
    }

    if (filters?.nationality) {
      qb.andWhere('c.nationality ILIKE :nationality', {
        nationality: `%${filters.nationality}%`,
      });
    }

    if (filters?.dateFrom) {
      qb.andWhere('c.created_at >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters?.dateTo) {
      // Browsers send the next local midnight as an instant; a bare date is a UTC day.
      const upper = isDateOnly(filters.dateTo)
        ? ":dateTo::date + interval '1 day'"
        : ':dateTo::timestamptz';
      qb.andWhere(`c.created_at < ${upper}`, {
        dateTo: filters.dateTo,
      });
    }

    qb.skip(pageSkip(page, limit))
      .take(clampLimit(limit))
      .orderBy('c.created_at', 'DESC');

    const [rows, total] = await qb.getManyAndCount();
    const withTags = await this.attachTags(companyId, rows);

    return {
      data: withTags.map((c) => this.serialize(c)),
      total,
      page,
      limit,
    };
  }

  async findOne(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<ContactResponse> {
    const contact = await this.findOneEntity(id, companyId, caller);
    const [withTag] = await this.attachTags(companyId, [contact]);
    return this.serialize(withTag);
  }

  // Internal callers omit `caller`: access is already established.
  async findOneEntity(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Contact> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Contact not found');
    }

    const contact = await this.contactRepository.findOne({
      where: {
        id,
        companyId,
        ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
      },
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateContactDto,
    caller?: RegionScope,
  ): Promise<ContactResponse> {
    const contact = await this.findOneEntity(id, companyId, caller);
    Object.assign(contact, dto);
    await this.contactRepository.save(contact);
    // A phone may have changed (or just been set): re-link chats for it.
    await this.linkMatchingChats(contact);
    return this.findOne(id, companyId);
  }

  // Moves edges to the target and deletes the source in one transaction.
  async remove(
    id: string,
    companyId: string,
    dto: DeleteContactDto,
    actorId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const { transferToContactId, reason } = dto;
    if (transferToContactId === id) {
      throw new BadRequestException('Cannot transfer a contact to itself');
    }

    // Verify source exists first, else a wrong id yields zero edges, a no-op reported as success.
    const source = await this.findOneEntity(id, companyId, caller);

    const [leadCount, unitCount, leaseCount, chatCount] = await Promise.all([
      this.leadRepository.count({ where: { contactId: id, companyId } }),
      this.unitRepository.count({ where: { ownerId: id, companyId } }),
      this.leaseRepository.count({ where: { contactId: id, companyId } }),
      this.chatRepository.count({ where: { contactId: id, companyId } }),
    ]);
    const hasEdges = leadCount + unitCount + leaseCount + chatCount > 0;

    if (hasEdges && !transferToContactId) {
      throw new BadRequestException(
        'This contact has leads, units, leases or chats. Choose a contact to transfer them to before deleting.',
      );
    }

    const recordDelete = async (
      manager: EntityManager,
      target: Contact | null,
    ) => {
      await this.recordHistoryService.record(manager, {
        companyId,
        action: RecordHistoryAction.DELETE,
        entityType: 'Contact',
        entityId: id,
        entityTitle:
          contactDisplayName(source) || source.email || 'Unnamed contact',
        contextTitle: target
          ? contactDisplayName(target) || target.email || null
          : null,
        reason,
        actorId,
        actorName: await this.recordHistoryService.resolveActorName(
          manager,
          actorId,
        ),
        regionCode: source.regionCode,
        metadata: {
          transferToContactId: target?.id ?? null,
          movedCounts: {
            leads: leadCount,
            units: unitCount,
            leases: leaseCount,
            chats: chatCount,
          },
        },
      });
    };

    if (!hasEdges) {
      await this.dataSource.transaction(async (manager) => {
        await recordDelete(manager, null);
        await manager.delete(Contact, { id, companyId });
      });
      return;
    }

    // Transfers edges and deletes source in one transaction so failure can't strand moved edges.
    const scopedCodes = scopedRegionCodes(caller);
    await this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(Contact, {
        where: {
          id: transferToContactId!,
          companyId,
          ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
        },
      });
      if (!target) {
        throw new NotFoundException('Transfer target contact not found');
      }
      await recordDelete(manager, target);
      await manager.update(
        Lead,
        { contactId: id, companyId },
        { contactId: target.id },
      );
      await manager.update(
        Lease,
        { contactId: id, companyId },
        { contactId: target.id },
      );
      await manager.update(
        Unit,
        { ownerId: id, companyId },
        { ownerId: target.id },
      );
      await manager.update(
        WhatsappChat,
        { contactId: id, companyId },
        { contactId: target.id },
      );
      await manager.delete(Contact, { id, companyId });
    });
  }

  // companyId is bound on the owning qb; EXISTS/COUNT subqueries reuse it, staying company-scoped.
  private tagExistsSql(contactCol: string, tag: ContactTag): string {
    switch (tag) {
      case 'lead':
        return `EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = ${contactCol} AND l.company_id = :companyId)`;
      case 'tenant':
        return `EXISTS (SELECT 1 FROM leases le WHERE le.contact_id = ${contactCol} AND le.company_id = :companyId AND le.deleted_at IS NULL)`;
      case 'owner':
        return `EXISTS (SELECT 1 FROM units u WHERE u.owner_id = ${contactCol} AND u.company_id = :companyId AND u.deleted_at IS NULL)`;
      case 'vendor':
        return `(SELECT COUNT(*) FROM units u WHERE u.owner_id = ${contactCol} AND u.company_id = :companyId AND u.deleted_at IS NULL) >= 2`;
    }
  }

  // Batch-computes tags for a page as 3 queries instead of N+1; every subquery is company-scoped.
  private async attachTags(
    companyId: string,
    contacts: Contact[],
  ): Promise<Array<Contact & { tags: ContactTag[] }>> {
    if (contacts.length === 0) {
      return contacts as Array<Contact & { tags: ContactTag[] }>;
    }
    const ids = contacts.map((c) => c.id);

    const [leadIds, tenantIds, ownerCounts] = await Promise.all([
      this.leadRepository
        .createQueryBuilder('l')
        .select('DISTINCT l.contact_id', 'id')
        .where('l.company_id = :companyId', { companyId })
        .andWhere('l.contact_id IN (:...ids)', { ids })
        .getRawMany<{ id: string }>(),
      this.leaseRepository
        .createQueryBuilder('le')
        .select('DISTINCT le.contact_id', 'id')
        .where('le.company_id = :companyId', { companyId })
        .andWhere('le.contact_id IN (:...ids)', { ids })
        .andWhere('le.deleted_at IS NULL')
        .getRawMany<{ id: string }>(),
      this.unitRepository
        .createQueryBuilder('u')
        .select('u.owner_id', 'id')
        .addSelect('COUNT(*)', 'n')
        .where('u.company_id = :companyId', { companyId })
        .andWhere('u.owner_id IN (:...ids)', { ids })
        .andWhere('u.deleted_at IS NULL')
        .groupBy('u.owner_id')
        .getRawMany<{ id: string; n: string }>(),
    ]);

    const leadSet = new Set(leadIds.map((r) => r.id));
    const tenantSet = new Set(tenantIds.map((r) => r.id));
    const ownerMap = new Map(ownerCounts.map((r) => [r.id, Number(r.n)]));

    return contacts.map((c) => {
      const tags: ContactTag[] = [];
      const units = ownerMap.get(c.id) ?? 0;
      if (units > 0) tags.push('owner');
      if (units >= 2) tags.push('vendor');
      if (leadSet.has(c.id)) tags.push('lead');
      if (tenantSet.has(c.id)) tags.push('tenant');
      return Object.assign(c, { tags });
    });
  }

  private serialize(c: Contact & { tags?: ContactTag[] }): ContactResponse {
    return {
      ...c,
      displayName: contactDisplayName(c),
      tags: c.tags ?? [],
    } as ContactResponse;
  }
}
