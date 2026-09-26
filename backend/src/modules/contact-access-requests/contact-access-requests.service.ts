import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  MoreThan,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  ContactAccessKind,
  ContactAccessRequest,
  ContactAccessSourceType,
  ContactAccessStatus,
} from './entities/contact-access-request.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import { Role } from '@shared/enums/roles.enum';
import { seesAllRegions } from '@shared/utils/region-visibility.util';
import {
  clampLimit,
  clampPage,
  paginationOptions,
} from '@shared/utils/pagination.util';
import {
  contactDisplayNameOr,
  normalizePhone,
} from '@shared/utils/contact.util';
import { isUniqueViolation } from '@shared/utils/name-normalization.util';
import { errorMessage } from '@shared/utils/error.util';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { RedisService } from '../redis/redis.service';

export interface ContactLinkSource {
  sourceType: ContactAccessSourceType;
  sourceId: string;
}

export interface ContactAccessRequestView {
  id: string;
  kind: ContactAccessKind;
  status: ContactAccessStatus;
  contact: { id: string; displayName: string; regionCode: string };
  requester: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
  regionCode: string;
  sourceType: ContactAccessSourceType | null;
  sourceId: string | null;
  note: string | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export const DEFAULT_GRANT_DAYS = 90;
export const VERIFY_MAX_MISSES = 5;
export const VERIFY_WINDOW_SECONDS = 3600;

const DAY_MS = 24 * 60 * 60 * 1000;
const APPROVER_REGION_ROLES: string[] = [Role.ADMIN, Role.MANAGER];

type Decision = 'approved' | 'rejected' | 'revoked';

type RaiseOutcome =
  | { existing: ContactAccessRequest }
  | {
      created: {
        row: ContactAccessRequest;
        contact: Contact;
        requesterName: string;
      };
    };

// Name only: the display helper falls back to the phone, which must never reach these surfaces.
export function contactTitle(
  contact: Pick<Contact, 'firstName' | 'lastName'> | null,
): string {
  return contactDisplayNameOr(
    contact
      ? { firstName: contact.firstName, lastName: contact.lastName }
      : null,
    'Unnamed contact',
  );
}

function userName(
  user: { name?: string | null; email?: string | null } | null,
): string {
  return user?.name?.trim() || user?.email || 'Unknown user';
}

export function serializeContactAccessRequest(
  row: ContactAccessRequest,
): ContactAccessRequestView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    contact: {
      id: row.contactId,
      displayName: contactTitle(row.contact ?? null),
      regionCode: row.contact?.regionCode ?? row.regionCode,
    },
    requester: { id: row.requesterId, name: userName(row.requester ?? null) },
    decidedBy: row.decidedBy
      ? { id: row.decidedBy, name: userName(row.decider ?? null) }
      : null,
    regionCode: row.regionCode,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    note: row.note,
    decidedAt: row.decidedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

// null means the grant never expires; a past date is rejected.
export function resolveApprovalExpiry(
  input: { expiresAt?: string; forever?: boolean },
  now: Date = new Date(),
): Date | null {
  if (input.forever && input.expiresAt) {
    throw new BadRequestException('Send either expiresAt or forever, not both');
  }
  if (input.forever) return null;
  if (!input.expiresAt) {
    return new Date(now.getTime() + DEFAULT_GRANT_DAYS * DAY_MS);
  }
  const expiresAt = new Date(input.expiresAt);
  if (isNaN(expiresAt.getTime())) {
    throw new BadRequestException('expiresAt is not a valid date');
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestException('expiresAt must be in the future');
  }
  return expiresAt;
}

function verifyKey(
  companyId: string,
  agentId: string,
  contactId: string,
): string {
  return `contact-access:verify:${companyId}:${agentId}:${contactId}`;
}

// The single writer of contact_access_requests; the presenter only reads it.
@Injectable()
export class ContactAccessRequestsService {
  private readonly logger = new Logger(ContactAccessRequestsService.name);

  constructor(
    @InjectRepository(ContactAccessRequest)
    private readonly repo: Repository<ContactAccessRequest>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly dataSource: DataSource,
    private readonly recordHistoryService: RecordHistoryService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  // Contact ids (from the given set) the user holds an unexpired APPROVED row for.
  async grantedContactIds(
    companyId: string,
    userId: string,
    contactIds: string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(contactIds.filter(Boolean))];
    if (ids.length === 0) return new Set();

    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.contactId', 'contactId')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.requesterId = :userId', { userId })
      .andWhere('r.contactId IN (:...ids)', { ids })
      .andWhere('r.status = :status', { status: ContactAccessStatus.APPROVED })
      .andWhere('(r.expiresAt IS NULL OR r.expiresAt > now())')
      .getRawMany<{ contactId: string }>();

    return new Set(rows.map((row) => row.contactId));
  }

  // MANAGER+ attached the agent to the contact: an APPROVED LINK row, no expiry, idempotent.
  async grantLink(
    companyId: string,
    contactId: string,
    agentId: string,
    actorId: string,
    source: ContactLinkSource,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const contact = await this.loadContact(manager, companyId, contactId);
      if (!contact) {
        throw new BadRequestException('Contact not found');
      }
      await this.grantInTx(manager, {
        contact,
        agentId,
        actorId,
        kind: ContactAccessKind.LINK,
        source,
        reason: null,
      });
    });
  }

  // Match grants VERIFIED and returns true; a miss is counted and audited, 429 after five an hour.
  async verifyPhone(
    companyId: string,
    contactId: string,
    agentId: string,
    phone: string,
    source: ContactLinkSource,
  ): Promise<boolean> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, companyId },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        phone: true,
        regionCode: true,
      },
    });
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`);
    }

    const key = verifyKey(companyId, agentId, contactId);
    // Checked before comparing, so a locked-out caller cannot keep guessing for a match.
    const misses = Number(await this.redisService.client.get(key)) || 0;
    if (misses >= VERIFY_MAX_MISSES) {
      throw this.tooManyAttempts();
    }

    const typed = normalizePhone(phone);
    const stored = normalizePhone(contact.phone);
    if (typed && stored && typed === stored) {
      await this.dataSource.transaction(async (manager) => {
        await this.grantInTx(manager, {
          contact,
          agentId,
          actorId: agentId,
          kind: ContactAccessKind.VERIFIED,
          source,
          reason: 'Phone verified',
        });
      });
      return true;
    }

    const count = await this.redisService.client.incr(key);
    if (count === 1) {
      await this.redisService.client.expire(key, VERIFY_WINDOW_SECONDS);
    }
    await this.auditService.log({
      companyId,
      userId: agentId,
      action: AuditAction.ACCESS_VERIFY_FAILED,
      entityType: 'Contact',
      entityId: contactId,
      regionCode: contact.regionCode,
      newValue: { attempt: count },
    });
    if (count > VERIFY_MAX_MISSES) {
      throw this.tooManyAttempts();
    }
    return false;
  }

  // Idempotent PENDING REQUEST row plus approver notifications, for access without a verified phone.
  async raiseRequest(
    companyId: string,
    contactId: string,
    requesterId: string,
    source: ContactLinkSource | null,
    note?: string | null,
  ): Promise<ContactAccessRequest> {
    let result: RaiseOutcome;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const contact = await this.loadContact(manager, companyId, contactId);
        if (!contact) {
          throw new NotFoundException(`Contact with ID ${contactId} not found`);
        }
        const existing =
          (await this.findActiveGrant(
            manager,
            companyId,
            contactId,
            requesterId,
          )) ??
          (await this.findPending(manager, companyId, contactId, requesterId));
        if (existing) return { existing };

        const row = await manager.save(
          ContactAccessRequest,
          manager.create(ContactAccessRequest, {
            companyId,
            contactId,
            requesterId,
            regionCode: contact.regionCode,
            kind: ContactAccessKind.REQUEST,
            status: ContactAccessStatus.PENDING,
            sourceType: source?.sourceType ?? null,
            sourceId: source?.sourceId ?? null,
            note: note?.trim() || null,
          }),
        );
        const requesterName = await this.recordHistoryService.resolveActorName(
          manager,
          requesterId,
        );
        await this.recordHistoryService.record(manager, {
          companyId,
          action: RecordHistoryAction.ACCESS_REQUESTED,
          entityType: 'Contact',
          entityId: contactId,
          entityTitle: contactTitle(contact),
          reason: row.note,
          actorId: requesterId,
          actorName: requesterName,
          regionCode: contact.regionCode,
          metadata: { requestId: row.id, kind: row.kind },
        });
        return { created: { row, contact, requesterName } };
      });
    } catch (err) {
      // A concurrent request won the one-pending-per-pair index; hand back that row.
      if (!isUniqueViolation(err)) throw err;
      const pending = await this.findPending(
        this.dataSource.manager,
        companyId,
        contactId,
        requesterId,
      );
      if (!pending) throw err;
      return pending;
    }

    if ('existing' in result) return result.existing;
    const { row, contact, requesterName } = result.created;

    try {
      await this.notificationsService.notifyContactAccessRequested({
        companyId,
        requestId: row.id,
        requesterId,
        requesterName,
        contactName: contactTitle(contact),
        regionCode: contact.regionCode,
      });
    } catch (err) {
      this.logger.error(
        `Approver notification failed for access request ${row.id}: ${errorMessage(err)}`,
      );
    }
    return row;
  }

  async findAll(
    companyId: string,
    user: JwtUserPayload,
    query: {
      status?: string;
      kind?: string;
      page?: number;
      limit?: number;
      mine?: boolean;
    },
  ): Promise<{
    data: ContactAccessRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.viewQuery(companyId);

    if (query.mine || !this.decidesAnyRegion(user.role)) {
      qb.andWhere('r.requesterId = :requesterId', {
        requesterId: user.userId,
      });
    } else if (!seesAllRegions(user.role)) {
      const regionCodes = user.regionCodes ?? [];
      if (regionCodes.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('r.regionCode IN (:...regionCodes)', { regionCodes });
      }
    }

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    qb.andWhere('r.kind = :kind', {
      kind: query.kind ?? ContactAccessKind.REQUEST,
    });

    const { skip, take } = paginationOptions(query.page, query.limit);
    const [data, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return {
      data,
      total,
      page: clampPage(query.page),
      limit: clampLimit(query.limit),
    };
  }

  // One row with the joins the serializer needs; never selects contact personal data.
  async findOneForView(
    companyId: string,
    id: string,
  ): Promise<ContactAccessRequest> {
    const row = await this.viewQuery(companyId)
      .andWhere('r.id = :id', { id })
      .getOne();
    if (!row) {
      throw new NotFoundException(`Access request with ID ${id} not found`);
    }
    return row;
  }

  async approve(
    companyId: string,
    user: JwtUserPayload,
    id: string,
    expiresAt: Date | null,
  ): Promise<ContactAccessRequest> {
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    return this.decide(companyId, user, id, 'approved', {
      from: ContactAccessStatus.PENDING,
      to: ContactAccessStatus.APPROVED,
      action: RecordHistoryAction.ACCESS_GRANTED,
      expiresAt,
      reason: null,
    });
  }

  async reject(
    companyId: string,
    user: JwtUserPayload,
    id: string,
    reason: string,
  ): Promise<ContactAccessRequest> {
    return this.decide(companyId, user, id, 'rejected', {
      from: ContactAccessStatus.PENDING,
      to: ContactAccessStatus.REJECTED,
      action: RecordHistoryAction.ACCESS_REJECTED,
      expiresAt: undefined,
      reason: this.requireReason(reason),
    });
  }

  async revoke(
    companyId: string,
    user: JwtUserPayload,
    id: string,
    reason: string,
  ): Promise<ContactAccessRequest> {
    return this.decide(companyId, user, id, 'revoked', {
      from: ContactAccessStatus.APPROVED,
      to: ContactAccessStatus.REVOKED,
      action: RecordHistoryAction.ACCESS_REVOKED,
      expiresAt: undefined,
      reason: this.requireReason(reason),
    });
  }

  private async decide(
    companyId: string,
    user: JwtUserPayload,
    id: string,
    decision: Decision,
    step: {
      from: ContactAccessStatus;
      to: ContactAccessStatus;
      action: RecordHistoryAction;
      expiresAt: Date | null | undefined;
      reason: string | null;
    },
  ): Promise<ContactAccessRequest> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(ContactAccessRequest, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException(`Access request with ID ${id} not found`);
      }
      this.assertCanDecide(user, row);
      if (row.status !== step.from) {
        throw new ConflictException(
          `Only a ${step.from} request can be ${decision}`,
        );
      }

      row.status = step.to;
      row.decidedBy = user.userId;
      row.decidedAt = new Date();
      if (step.expiresAt !== undefined) {
        row.expiresAt = step.expiresAt;
      }
      if (step.reason !== null) {
        row.note = step.reason;
      }
      await manager.save(ContactAccessRequest, row);

      const contact = await this.loadContact(manager, companyId, row.contactId);
      const title = contactTitle(contact);
      await this.recordHistoryService.record(manager, {
        companyId,
        action: step.action,
        entityType: 'Contact',
        entityId: row.contactId,
        entityTitle: title,
        contextTitle: `Requested by ${await this.recordHistoryService.resolveActorName(
          manager,
          row.requesterId,
        )}`,
        reason: step.reason,
        actorId: user.userId,
        actorName: await this.recordHistoryService.resolveActorName(
          manager,
          user.userId,
        ),
        regionCode: row.regionCode,
        metadata: {
          requestId: row.id,
          requesterId: row.requesterId,
          kind: row.kind,
          expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        },
      });
      return { row, title };
    });

    try {
      await this.notificationsService.notifyContactAccessDecided({
        companyId,
        requestId: outcome.row.id,
        requesterId: outcome.row.requesterId,
        contactName: outcome.title,
        regionCode: outcome.row.regionCode,
        decision,
        reason: step.reason,
      });
    } catch (err) {
      this.logger.error(
        `Requester notification failed for access request ${outcome.row.id}: ${errorMessage(err)}`,
      );
    }

    return this.findOneForView(companyId, outcome.row.id);
  }

  // Idempotent grant: keeps an unexpired approval, approves a pending row, else inserts.
  private async grantInTx(
    manager: EntityManager,
    input: {
      contact: Contact;
      agentId: string;
      actorId: string;
      kind: ContactAccessKind.LINK | ContactAccessKind.VERIFIED;
      source: ContactLinkSource;
      reason: string | null;
    },
  ): Promise<void> {
    const { contact, agentId, actorId } = input;
    const companyId = contact.companyId;

    const now = new Date();
    const active = await this.findActiveGrant(
      manager,
      companyId,
      contact.id,
      agentId,
    );
    if (active?.expiresAt === null) return;
    if (active) {
      // A link or a verified phone never expires; it outlives an earlier dated approval.
      active.expiresAt = null;
      active.decidedBy = actorId;
      active.decidedAt = now;
      await manager.save(ContactAccessRequest, active);
      return;
    }

    const pending = await this.findPending(
      manager,
      companyId,
      contact.id,
      agentId,
    );
    let row: ContactAccessRequest;
    if (pending) {
      pending.status = ContactAccessStatus.APPROVED;
      pending.decidedBy = actorId;
      pending.decidedAt = now;
      pending.expiresAt = null;
      row = await manager.save(ContactAccessRequest, pending);
    } else {
      row = await manager.save(
        ContactAccessRequest,
        manager.create(ContactAccessRequest, {
          companyId,
          contactId: contact.id,
          requesterId: agentId,
          regionCode: contact.regionCode,
          kind: input.kind,
          status: ContactAccessStatus.APPROVED,
          sourceType: input.source.sourceType,
          sourceId: input.source.sourceId,
          decidedBy: actorId,
          decidedAt: now,
          expiresAt: null,
        }),
      );
    }

    await this.recordHistoryService.record(manager, {
      companyId,
      action: RecordHistoryAction.ACCESS_GRANTED,
      entityType: 'Contact',
      entityId: contact.id,
      entityTitle: contactTitle(contact),
      reason: input.reason,
      actorId,
      actorName: await this.recordHistoryService.resolveActorName(
        manager,
        actorId,
      ),
      regionCode: contact.regionCode,
      metadata: {
        requestId: row.id,
        requesterId: agentId,
        kind: row.kind,
        sourceType: input.source.sourceType,
        sourceId: input.source.sourceId,
      },
    });
  }

  private viewQuery(
    companyId: string,
  ): SelectQueryBuilder<ContactAccessRequest> {
    return this.repo
      .createQueryBuilder('r')
      .leftJoin('r.contact', 'c')
      .addSelect(['c.id', 'c.firstName', 'c.lastName', 'c.regionCode'])
      .leftJoin('r.requester', 'rq')
      .addSelect(['rq.id', 'rq.name', 'rq.email'])
      .leftJoin('r.decider', 'd')
      .addSelect(['d.id', 'd.name', 'd.email'])
      .where('r.companyId = :companyId', { companyId });
  }

  private loadContact(
    manager: EntityManager,
    companyId: string,
    contactId: string,
  ): Promise<Contact | null> {
    return manager.findOne(Contact, {
      where: { id: contactId, companyId },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        regionCode: true,
      },
    });
  }

  private findActiveGrant(
    manager: EntityManager,
    companyId: string,
    contactId: string,
    requesterId: string,
  ): Promise<ContactAccessRequest | null> {
    const base: FindOptionsWhere<ContactAccessRequest> = {
      companyId,
      contactId,
      requesterId,
      status: ContactAccessStatus.APPROVED,
    };
    return manager.findOne(ContactAccessRequest, {
      where: [
        { ...base, expiresAt: IsNull() },
        { ...base, expiresAt: MoreThan(new Date()) },
      ],
    });
  }

  private findPending(
    manager: EntityManager,
    companyId: string,
    contactId: string,
    requesterId: string,
  ): Promise<ContactAccessRequest | null> {
    return manager.findOne(ContactAccessRequest, {
      where: {
        companyId,
        contactId,
        requesterId,
        status: ContactAccessStatus.PENDING,
      },
    });
  }

  private decidesAnyRegion(role: string): boolean {
    return seesAllRegions(role) || APPROVER_REGION_ROLES.includes(role);
  }

  private assertCanDecide(
    user: JwtUserPayload,
    row: ContactAccessRequest,
  ): void {
    if (seesAllRegions(user.role)) return;
    if (
      APPROVER_REGION_ROLES.includes(user.role) &&
      (user.regionCodes ?? []).includes(row.regionCode)
    ) {
      return;
    }
    throw new ForbiddenException(
      'You can only decide access requests in your own regions',
    );
  }

  private requireReason(reason: string): string {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException('A reason is required');
    }
    return trimmed;
  }

  private tooManyAttempts(): HttpException {
    return new HttpException(
      'Too many attempts, try again later',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
