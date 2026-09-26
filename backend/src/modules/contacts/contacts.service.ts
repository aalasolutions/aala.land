import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { contactListLimit, pageSkip } from '@shared/utils/pagination.util';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
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
  seesAllRegions,
} from '../../shared/utils/region-visibility.util';
import { isDateOnly } from '../../shared/utils/region-time.util';
import { Role } from '../../shared/enums/roles.enum';
import {
  ContactPrivacyService,
  ContactViewer,
  PresentedContact,
} from './contact-privacy.service';
import { ContactAccessRequestsService } from '../contact-access-requests/contact-access-requests.service';
import { ContactAccessSourceType } from '../contact-access-requests/entities/contact-access-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';

// Derived role tags; never stored on the contact, computed from which rows reference it.
export type ContactTag = 'lead' | 'tenant' | 'owner' | 'vendor';

// Roles that may fold new details into an existing contact; everyone else gets CONTACT_EXISTS.
const MERGE_ROLES: string[] = [
  Role.SUPER_ADMIN,
  Role.COMPANY_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
];

export function canMergeContacts(role?: string): boolean {
  return !!role && MERGE_ROLES.includes(role);
}

// A term with this many digits is a phone lookup and must match the whole subscriber number.
const PHONE_SEARCH_MIN_DIGITS = 7;

// Region-bound editors: they may edit only contacts in their own regions.
const REGION_EDIT_ROLES: string[] = [Role.ADMIN, Role.MANAGER];

// Additional list filters beyond search and role tag.
export interface ContactFilters {
  agentId?: string;
  isWhatsapp?: boolean;
  company?: string;
  nationality?: string;
  dateFrom?: string;
  dateTo?: string;
  regionCode?: string;
  // Company-wide list: the region clause is skipped, regionCode included.
  allRegions?: boolean;
}

export interface ResolvedContact {
  contact: Contact;
  // True when the identity matched a contact that was already on file.
  existing: boolean;
}

export interface VerifyPhoneResult {
  verified: boolean;
  contact: PresentedContact;
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
    private readonly contactPrivacy: ContactPrivacyService,
    private readonly contactAccessRequests: ContactAccessRequestsService,
    private readonly auditService: AuditService,
  ) {}

  // One-number-one-contact: MANAGER+ merges into the match, anyone else gets 409 CONTACT_EXISTS.
  async create(
    companyId: string,
    dto: CreateContactDto,
    createdBy: string,
    caller: RegionScope,
  ): Promise<PresentedContact> {
    const viewer: ContactViewer = {
      userId: createdBy,
      role: caller.role,
      regionCodes: caller.regionCodes,
    };
    const existing = await this.findDuplicate(companyId, dto.phone, dto.email);
    if (existing) {
      if (!canMergeContacts(caller.role)) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Contact already added',
          code: 'CONTACT_EXISTS',
          contact: await this.contactPrivacy.presentOne(
            companyId,
            viewer,
            existing,
          ),
        });
      }
      const merged = await this.mergeEmpty(existing, dto, createdBy);
      return this.presentById(merged.id, companyId, viewer);
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
    return this.presentById(saved.id, companyId, viewer);
  }

  // Phone wins over email, the same key the whole contact model is unique on.
  private async findDuplicate(
    companyId: string,
    phone?: string | null,
    email?: string | null,
  ): Promise<Contact | null> {
    if (normalizePhone(phone)) {
      return this.contactRepository.findOne({
        where: { companyId, phone: phoneDigitsWhere(phone) },
      });
    }
    if (email) {
      return this.contactRepository.findOne({
        where: { companyId, email: emailEqualsWhere(email) },
      });
    }
    return null;
  }

  // Matches last 9 digits or email; only MANAGER+ merges into a match. Region defaults to company.
  async resolveOrCreate(
    companyId: string,
    identity: ContactIdentity,
    createdBy?: string,
    regionCode?: string,
    callerRole?: string,
  ): Promise<ResolvedContact> {
    if (identity.contactId) {
      const existing = await this.contactRepository.findOne({
        where: { id: identity.contactId, companyId },
      });
      if (!existing) {
        throw new BadRequestException('Contact not found');
      }
      return { contact: existing, existing: true };
    }

    const match = await this.findDuplicate(
      companyId,
      identity.phone,
      identity.email,
    );
    if (match) {
      if (!canMergeContacts(callerRole)) {
        return { contact: match, existing: true };
      }
      const merged = await this.mergeEmpty(
        match,
        {
          firstName: identity.firstName,
          lastName: identity.lastName,
          email: identity.email,
          phone: identity.phone,
          isWhatsapp: identity.isWhatsapp ?? undefined,
        },
        createdBy,
      );
      return { contact: merged, existing: true };
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
    return { contact: saved, existing: false };
  }

  // Only empty fields are filled from the input; a fill writes MERGE history in the same transaction.
  private async mergeEmpty(
    existing: Contact,
    input: Partial<Record<keyof Contact, string | boolean | null>>,
    actorId?: string,
  ): Promise<Contact> {
    const filledFields: string[] = [];
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
        filledFields.push(key as string);
      }
    }
    // isWhatsapp upgrades true->true; never downgrades an existing true.
    if (input.isWhatsapp && !existing.isWhatsapp) {
      existing.isWhatsapp = true;
      filledFields.push('isWhatsapp');
    }
    if (filledFields.length === 0) return existing;
    const saved = await this.dataSource.transaction(async (manager) => {
      const row = await manager.save(Contact, existing);
      if (actorId) {
        await this.recordHistoryService.record(manager, {
          companyId: existing.companyId,
          action: RecordHistoryAction.MERGE,
          entityType: 'Contact',
          entityId: existing.id,
          entityTitle:
            contactDisplayName(existing) || existing.email || 'Unnamed contact',
          actorId,
          actorName: await this.recordHistoryService.resolveActorName(
            manager,
            actorId,
          ),
          regionCode: existing.regionCode,
          metadata: { filledFields },
        });
      }
      return row;
    });
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
    caller?: ContactViewer,
  ): Promise<{
    data: PresentedContact[];
    total: number;
    page: number;
    limit: number;
  }> {
    const take = contactListLimit(limit);
    // Search and the all-regions view are company-wide; the presenter guards the personal fields.
    const companyWide = Boolean(search?.trim()) || filters?.allRegions === true;
    const regionCodes = companyWide
      ? null
      : effectiveRegionCodes(filters?.regionCode, caller);
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit: take };
    }

    const qb = this.contactRepository
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId });

    if (regionCodes) {
      qb.andWhere('c.region_code IN (:...regionCodes)', { regionCodes });
    }

    if (search?.trim()) {
      qb.andWhere(this.searchSql(search.trim()));
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

    qb.skip(pageSkip(page, take)).take(take).orderBy('c.created_at', 'DESC');

    const [rows, total] = await qb.getManyAndCount();
    const withTags = await this.attachTags(companyId, rows);

    return {
      data: await this.contactPrivacy.presentMany(companyId, caller, withTags),
      total,
      page,
      limit: take,
    };
  }

  // Every FULL view of a contact someone else created is audited, no dedup.
  async findOne(
    id: string,
    companyId: string,
    viewer?: ContactViewer,
  ): Promise<PresentedContact> {
    const presented = await this.presentById(id, companyId, viewer);
    if (
      viewer &&
      presented.accessLevel === 'FULL' &&
      presented.createdBy !== viewer.userId
    ) {
      await this.auditService.log({
        companyId,
        userId: viewer.userId,
        action: AuditAction.VIEW,
        entityType: 'Contact',
        entityId: id,
        regionCode: presented.regionCode,
      });
    }
    return presented;
  }

  private async presentById(
    id: string,
    companyId: string,
    viewer?: ContactViewer,
  ): Promise<PresentedContact> {
    const contact = await this.findOneEntity(id, companyId);
    const [withTag] = await this.attachTags(companyId, [contact]);
    return this.contactPrivacy.presentOne(companyId, viewer, withTag);
  }

  // Company scope only: every role can find every contact, the presenter decides what it sees.
  async findOneEntity(id: string, companyId: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id, companyId },
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
    viewer: ContactViewer,
  ): Promise<PresentedContact> {
    const contact = await this.findOneEntity(id, companyId);
    this.assertCanEdit(contact, viewer);
    Object.assign(contact, dto);
    await this.contactRepository.save(contact);
    // A phone may have changed (or just been set): re-link chats for it.
    await this.linkMatchingChats(contact);
    return this.presentById(id, companyId, viewer);
  }

  // Creator, ADMIN or MANAGER in the contact region, or a company-wide admin; grants never edit.
  private assertCanEdit(contact: Contact, viewer: ContactViewer): void {
    const isCreator =
      !!contact.createdBy && contact.createdBy === viewer.userId;
    const inOwnRegion =
      REGION_EDIT_ROLES.includes(viewer.role) &&
      (viewer.regionCodes ?? []).includes(contact.regionCode);
    if (isCreator || inOwnRegion || seesAllRegions(viewer.role)) return;
    throw new ForbiddenException('You cannot edit this contact');
  }

  // The stored number is compared server side; a miss returns the viewer's view, never the number.
  async verifyPhone(
    id: string,
    companyId: string,
    phone: string,
    viewer: ContactViewer,
  ): Promise<VerifyPhoneResult> {
    await this.findOneEntity(id, companyId);
    const verified = await this.contactAccessRequests.verifyPhone(
      companyId,
      id,
      viewer.userId,
      phone,
      { sourceType: ContactAccessSourceType.CONTACT, sourceId: id },
    );
    return {
      verified,
      contact: await this.presentById(id, companyId, viewer),
    };
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
    const source = await this.findOneEntity(id, companyId);
    // Deleting stays confined to the caller regions even though finding is company-wide.
    const scopedCodes = scopedRegionCodes(caller);
    if (scopedCodes && !scopedCodes.includes(source.regionCode)) {
      throw new NotFoundException('Contact not found');
    }

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
    await this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(Contact, {
        where: { id: transferToContactId!, companyId },
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

  // Names match by substring; phone and email only whole, so a masked value cannot be rebuilt.
  private searchSql(term: string): Brackets {
    const digits = normalizePhone(term);
    const isPhone = !!digits && digits.length >= PHONE_SEARCH_MIN_DIGITS;
    const isEmail = term.includes('@');
    return new Brackets((where) => {
      if (isPhone) {
        where.where(
          `RIGHT(regexp_replace(c.phone, '\\D', '', 'g'), 9) = :phoneDigits`,
          { phoneDigits: digits },
        );
        return;
      }
      if (isEmail) {
        where.where('LOWER(c.email) = :emailExact', {
          emailExact: term.toLowerCase(),
        });
        return;
      }
      where
        .where('c.first_name ILIKE :s', { s: `%${term}%` })
        .orWhere('c.last_name ILIKE :s');
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
}
