import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { PropertyDocument } from '../../properties/entities/property-document.entity';
import { Owner } from '../../owners/entities/owner.entity';
import {
  Commission,
  CommissionStatus,
} from '../../commissions/entities/commission.entity';
import { WorkOrder } from '../../maintenance/entities/work-order.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import {
  ReassignedEntityType,
  ReassignmentReport,
} from './reassignment-report';

interface ReassignmentTarget {
  type: ReassignedEntityType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entity: any;
  setProperty: string; // entity property written with the new owner id
  column: string; // snake_case DB column matched in the WHERE clause
  extraWhere?: string;
  extraParams?: Record<string, unknown>;
}

// Order matches the frozen ReassignedEntityType union (contract section 12).
const REASSIGNMENT_TARGETS: ReassignmentTarget[] = [
  {
    type: 'lead',
    entity: Lead,
    setProperty: 'assignedTo',
    column: 'assigned_to',
  },
  {
    type: 'document',
    entity: PropertyDocument,
    setProperty: 'uploadedBy',
    column: 'uploaded_by',
  },
  {
    type: 'owner',
    entity: Owner,
    setProperty: 'assignedAgentId',
    column: 'assigned_agent_id',
  },
  {
    type: 'commission',
    entity: Commission,
    setProperty: 'agentId',
    column: 'agent_id',
    // PENDING only. APPROVED, PAID, and CANCELLED are financial records and
    // must keep their agent attribution (PRICING_STRATEGY.md, contract section 12).
    extraWhere: 'AND status = :pendingStatus',
    extraParams: { pendingStatus: CommissionStatus.PENDING },
  },
  {
    type: 'work_order',
    entity: WorkOrder,
    setProperty: 'assignedTo',
    column: 'assigned_to',
  },
  {
    type: 'contact',
    entity: Contact,
    setProperty: 'createdBy',
    column: 'created_by',
  },
];

// WhatsApp rows are NOT in the list above. They move in reassignWhatsappRows(), outside
// the per-company advisory lock: whatsapp_messages has no retention policy, so its row
// count is unbounded, and holding the lock across it would stall the tenant's AI replies
// and billing writes (both take the same key).
const WA_BATCH = 5000;

@Injectable()
export class UserReassignmentService {
  private readonly logger = new Logger(UserReassignmentService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Moves a departing agent's WhatsApp rows to the reassignee.
   *
   * Runs OUTSIDE the per-company advisory lock, because whatsapp_messages has no
   * retention policy and an unbounded UPDATE under that lock would stall the tenant's
   * AI replies and billing writes.
   *
   * Callers run it AFTER the removal has committed: the authorization for a removal
   * lives inside the locked transaction, so moving first would act before permission
   * is checked. The trade-off is that a failure here strands rows on the departing
   * user_id. It is idempotent, and StrandedWhatsappRowsCron re-runs it for those rows.
   */
  async reassignWhatsappRows(
    companyId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<{ chats: number; messages: number }> {
    // Equal ids would make moveInBatches loop forever: the UPDATE never shrinks the WHERE.
    if (fromUserId === toUserId) return { chats: 0, messages: 0 };

    // One transaction so a partial move cannot leave previews describing a moved thread.
    const { chats, messages } = await this.dataSource.transaction(
      async (manager) => {
        // Only these chats can end up with a stale preview, so the refresh is scoped to
        // them rather than sorting the reassignee's whole history.
        const affectedChats: Array<{ chat_id: string }> = await manager.query(
          `SELECT DISTINCT "chat_id" FROM "whatsapp_chats"
            WHERE "company_id" = $1 AND "user_id" = $2`,
          [companyId, fromUserId],
        );
        const chatIds = affectedChats.map((r) => r.chat_id);

        // A collision means the reassignee already holds this exact message
        // (same company_id + wa_message_id), so the departing copy is redundant.
        await manager.query(
          `DELETE FROM "whatsapp_messages" m
            WHERE m."company_id" = $1 AND m."user_id" = $2
              AND EXISTS (SELECT 1 FROM "whatsapp_messages" dup
                           WHERE dup."company_id" = $1 AND dup."user_id" = $3
                             AND dup."wa_message_id" = m."wa_message_id")`,
          [companyId, fromUserId, toUserId],
        );

        const movedMessages = await this.moveInBatches(
          manager,
          'whatsapp_messages',
          companyId,
          fromUserId,
          toUserId,
        );

        // Colliding chats are dropped, not moved: the reassignee already has a preview
        // row for that conversation, and it is recomputed below.
        await manager.query(
          `DELETE FROM "whatsapp_chats" c
            WHERE c."company_id" = $1 AND c."user_id" = $2
              AND EXISTS (SELECT 1 FROM "whatsapp_chats" dup
                           WHERE dup."company_id" = $1 AND dup."user_id" = $3
                             AND dup."chat_id" = c."chat_id")`,
          [companyId, fromUserId, toUserId],
        );

        const movedChats = await this.moveInBatches(
          manager,
          'whatsapp_chats',
          companyId,
          fromUserId,
          toUserId,
        );

        await this.refreshChatPreviews(manager, companyId, toUserId, chatIds);

        return { chats: movedChats, messages: movedMessages };
      },
    );

    this.logger.log(
      `Moved WhatsApp rows in company ${companyId} from ${fromUserId} to ${toUserId}: chats=${chats}, messages=${messages}`,
    );
    return { chats, messages };
  }

  private async moveInBatches(
    manager: EntityManager,
    table: 'whatsapp_messages' | 'whatsapp_chats',
    companyId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<number> {
    let moved = 0;
    for (;;) {
      const result: [unknown[], number] = await manager.query(
        `UPDATE "${table}" SET "user_id" = $3
          WHERE "ctid" IN (
            SELECT "ctid" FROM "${table}"
             WHERE "company_id" = $1 AND "user_id" = $2
             LIMIT ${WA_BATCH}
          )`,
        [companyId, fromUserId, toUserId],
      );
      const affected = result[1] ?? 0;
      moved += affected;
      if (affected < WA_BATCH) break;
    }
    return moved;
  }

  // Messages can move without their preview row, so last_body/last_ts stop describing
  // the thread the reassignee now holds. Scoped to the chats that actually moved.
  private async refreshChatPreviews(
    manager: EntityManager,
    companyId: string,
    toUserId: string,
    chatIds: string[],
  ): Promise<void> {
    if (chatIds.length === 0) return;
    await manager.query(
      `UPDATE "whatsapp_chats" c SET
         "last_body"    = m."body",
         "last_ts"      = m."timestamp",
         "last_from_me" = m."from_me",
         "updated_at"   = now()
       FROM (
         SELECT DISTINCT ON ("chat_id") "chat_id", "body", "timestamp", "from_me"
           FROM "whatsapp_messages"
          WHERE "company_id" = $1 AND "user_id" = $2 AND "chat_id" = ANY($3)
          ORDER BY "chat_id", "timestamp" DESC, "created_at" DESC
       ) m
       WHERE c."company_id" = $1 AND c."user_id" = $2
         AND c."chat_id" = m."chat_id"
         AND m."timestamp" > c."last_ts"`,
      [companyId, toUserId, chatIds],
    );
  }

  /**
   * Reassigns every company-scoped record owned by fromUserId to toUserId.
   * MUST be called with the manager of an open transaction; this service
   * never commits or rolls back on its own.
   */
  async reassignOwnedRecords(
    manager: EntityManager,
    companyId: string,
    fromUserId: string,
    toUserId: string,
    reason: string,
    options: { collectIds?: boolean } = {},
  ): Promise<ReassignmentReport> {
    // Only materialize the reassigned row ids when a recorder will consume them.
    // Otherwise rely on the driver's affected-row count, so a large tenant does not
    // pull tens of thousands of UUIDs into memory for a payload nobody reads.
    const collectIds = options.collectIds ?? false;
    const entities: ReassignmentReport['entities'] = [];

    for (const target of REASSIGNMENT_TARGETS) {
      const query = manager
        .createQueryBuilder()
        .update(target.entity)
        .set({ [target.setProperty]: toUserId })
        .where(
          `${target.column} = :fromUserId AND company_id = :companyId ${target.extraWhere ?? ''}`,
          { fromUserId, companyId, ...(target.extraParams ?? {}) },
        );

      const result = await (
        collectIds ? query.returning('id') : query
      ).execute();

      if (collectIds) {
        const ids = (result.raw as Array<{ id: string }>).map((row) => row.id);
        entities.push({ type: target.type, count: ids.length, ids });
      } else {
        entities.push({
          type: target.type,
          count: result.affected ?? 0,
          ids: [],
        });
      }
    }

    const summary = entities.map((e) => `${e.type}=${e.count}`).join(', ');
    this.logger.log(
      `Reassigned records in company ${companyId} from ${fromUserId} to ${toUserId}: ${summary}`,
    );

    return { fromUserId, toUserId, reason, entities };
  }
}
