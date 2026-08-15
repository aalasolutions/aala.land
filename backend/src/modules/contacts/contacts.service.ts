import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WhatsappChat } from '../whatsapp/entities/whatsapp-chat.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import {
  contactDisplayName,
  emailEqualsWhere,
  normalizePhone,
  phoneDigitsWhere,
} from '../../shared/utils/contact.util';

// Derived role tags. Never stored on the contact; computed from which rows
// reference it.
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
}

// Identity carried inline when attaching a person (lead capture, unit owner,
// lease tenant). Either an existing contact id, or details to resolve/create.
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
  ) {}

  // Adding a contact honors the same one-number-one-contact rule as lead
  // capture: a number that already belongs to a contact resolves to it rather
  // than creating a duplicate. Resolving does NOT discard what the operator
  // typed: the supplied fields fill the existing contact's empty slots (existing
  // data is never overwritten), so the input is never silently lost. Contacts
  // with neither phone nor email are the plain-contact case, created as-is.
  async create(
    companyId: string,
    dto: CreateContactDto,
    createdBy: string,
  ): Promise<Contact> {
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
      return this.mergeEmpty(existing, dto);
    }

    const contact = this.contactRepository.create({
      ...dto,
      companyId,
      createdBy,
    });
    const saved = await this.contactRepository.save(contact);
    await this.linkMatchingChats(saved);
    return saved;
  }

  // One number is one contact, within a company. Used wherever a person is
  // attached: entering a number that already belongs to a contact resolves to
  // that contact with no prompt and no second row. The match is done in SQL on
  // the last 9 digits so a stored number with spaces, dashes or brackets still
  // resolves. Contacts with no phone match on lowercased email; a contact with
  // neither is just created (the plain-contact case). On resolve, identity
  // fields fill the existing contact's empty slots.
  async resolveOrCreate(
    companyId: string,
    identity: ContactIdentity,
    createdBy?: string,
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

  // Fill an existing contact's empty fields from a partial input. Existing data
  // is never overwritten, so resolving a number already on file still records
  // anything new the operator supplied. Returns the (saved) contact.
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

  // Link every chat in the company whose JID number matches this contact's
  // phone, and clear the resolution-attempted latch. This is what unblocks a
  // stranger chat after the operator saves the person: the chat was latched
  // attempted=true with contact_id NULL on first contact (no match yet), so the
  // per-message resolver never retries. Creating or updating the contact is the
  // signal that a match may now exist, so we resolve those chats here.
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
  ): Promise<{
    data: ContactResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.contactRepository
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId });

    if (search) {
      qb.andWhere(
        `(c.first_name ILIKE :s OR c.last_name ILIKE :s OR c.email ILIKE :s OR c.phone ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    if (tag) {
      // companyId is already bound on the qb; the EXISTS subqueries reuse it so
      // every role check stays company-scoped.
      qb.andWhere(this.tagExistsSql('c.id', tag));
    }

    if (filters?.agentId) {
      // An agent may be assigned via a lead OR via a unit this contact owns.
      // Both are company-scoped through the same :companyId already bound.
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = c.id AND l.company_id = :companyId AND l.assigned_to = :agentId)
          OR EXISTS (SELECT 1 FROM units u WHERE u.owner_id = c.id AND u.company_id = :companyId AND u.assigned_agent_id = :agentId))`,
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
      qb.andWhere('c.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.skip((page - 1) * limit)
      .take(limit)
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

  async findOne(id: string, companyId: string): Promise<ContactResponse> {
    const contact = await this.contactRepository.findOne({
      where: { id, companyId },
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    const [withTag] = await this.attachTags(companyId, [contact]);
    return this.serialize(withTag);
  }

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
  ): Promise<ContactResponse> {
    const contact = await this.findOneEntity(id, companyId);
    Object.assign(contact, dto);
    await this.contactRepository.save(contact);
    // A phone may have changed (or just been set): re-link chats for it.
    await this.linkMatchingChats(contact);
    return this.findOne(id, companyId);
  }

  // Delete is transfer when the contact still has edges: leads, owned units,
  // leases and chats move to another contact, then the source is removed. All of
  // it in ONE transaction so a failed delete cannot leave the edges moved and
  // the source contact alive owning nothing. A contact with nothing to move
  // deletes outright.
  async remove(
    id: string,
    companyId: string,
    transferToContactId?: string,
  ): Promise<void> {
    if (transferToContactId === id) {
      throw new BadRequestException('Cannot transfer a contact to itself');
    }

    // Verify the source exists in this company first. Without this, a wrong id
    // (or another company's) yields zero edge counts and a delete that touches
    // nothing, reported as success instead of 404.
    await this.findOneEntity(id, companyId);

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

    if (!hasEdges) {
      // Nothing to move: a plain delete needs no transaction.
      await this.contactRepository.delete({ id, companyId });
      return;
    }

    // Transfer the edges AND delete the source in one transaction, so a failed
    // delete cannot leave the edges moved and the source contact alive owning
    // nothing.
    await this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(Contact, {
        where: { id: transferToContactId!, companyId },
      });
      if (!target) {
        throw new NotFoundException('Transfer target contact not found');
      }
      await manager.update(
        Lead,
        { contactId: id, companyId },
        { contactId: target.id },
      );
      await manager.update(
        Unit,
        { ownerId: id, companyId },
        { ownerId: target.id },
      );
      await manager.update(
        Lease,
        { contactId: id, companyId },
        { contactId: target.id },
      );
      await manager.update(
        WhatsappChat,
        { contactId: id, companyId },
        { contactId: target.id },
      );
      await manager.delete(Contact, { id, companyId });
    });
  }

  // -- role tag derivation -------------------------------------------------

  // EXISTS / COUNT subqueries. companyId is bound on the owning query builder,
  // so these reuse :companyId and stay company-scoped.
  private tagExistsSql(contactCol: string, tag: ContactTag): string {
    switch (tag) {
      case 'lead':
        return `EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = ${contactCol} AND l.company_id = :companyId)`;
      case 'tenant':
        return `EXISTS (SELECT 1 FROM leases le WHERE le.contact_id = ${contactCol} AND le.company_id = :companyId)`;
      case 'owner':
        return `EXISTS (SELECT 1 FROM units u WHERE u.owner_id = ${contactCol} AND u.company_id = :companyId)`;
      case 'vendor':
        return `(SELECT COUNT(*) FROM units u WHERE u.owner_id = ${contactCol} AND u.company_id = :companyId) >= 2`;
    }
  }

  // Batch-compute tags for a page of contacts: 3 queries (lead ids, tenant ids,
  // owner counts) instead of N+1. Every subquery is company-scoped.
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
        .getRawMany<{ id: string }>(),
      this.unitRepository
        .createQueryBuilder('u')
        .select('u.owner_id', 'id')
        .addSelect('COUNT(*)', 'n')
        .where('u.company_id = :companyId', { companyId })
        .andWhere('u.owner_id IN (:...ids)', { ids })
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
