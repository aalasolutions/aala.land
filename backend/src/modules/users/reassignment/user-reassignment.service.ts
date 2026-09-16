import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { PropertyDocument } from '../../properties/entities/property-document.entity';
import { Unit } from '../../properties/entities/unit.entity';
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
  entity: EntityTarget<unknown>;
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
    type: 'unit',
    entity: Unit,
    setProperty: 'assignedAgentId',
    column: 'assigned_agent_id',
    // Archived units keep the departed agent.
    extraWhere: 'AND deleted_at IS NULL',
  },
  {
    type: 'commission',
    entity: Commission,
    setProperty: 'agentId',
    column: 'agent_id',
    // PENDING only: APPROVED/PAID/CANCELLED are financial records, keep their attribution
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

// Execution order is lock-safe: lead and work order before unit, unit before document.
const REASSIGNMENT_EXECUTION_ORDER: ReassignedEntityType[] = [
  'lead',
  'work_order',
  'unit',
  'document',
  'commission',
  'contact',
];

// Moved outside the advisory lock: an unbounded UPDATE here would stall AI replies/billing
const WA_BATCH = 5000;

@Injectable()
export class UserReassignmentService {
  private readonly logger = new Logger(UserReassignmentService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Run after removal commits; idempotent, a failure here gets retried by the cron. */
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
        // Scoped to these chats only, not the reassignee's whole history
        const affectedChats: Array<{ chat_id: string }> = await manager.query(
          `SELECT DISTINCT "chat_id" FROM "whatsapp_chats"
            WHERE "company_id" = $1 AND "user_id" = $2`,
          [companyId, fromUserId],
        );
        const chatIds = affectedChats.map((r) => r.chat_id);

        // A collision means the reassignee already holds this exact message
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

        // Colliding chats are dropped, not moved; reassignee's preview is recomputed below
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

  // Messages can move without their preview row; scoped to chats that actually moved
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

  /** MUST use the manager of an open transaction; never commits or rolls back on its own. */
  async reassignOwnedRecords(
    manager: EntityManager,
    companyId: string,
    fromUserId: string,
    toUserId: string,
    reason: string,
    options: { collectIds?: boolean } = {},
  ): Promise<ReassignmentReport> {
    // Only materialize ids when a recorder consumes them; avoids loading UUIDs nobody reads
    const collectIds = options.collectIds ?? false;
    const byType = new Map<
      ReassignedEntityType,
      ReassignmentReport['entities'][number]
    >();

    for (const type of REASSIGNMENT_EXECUTION_ORDER) {
      const target = REASSIGNMENT_TARGETS.find((t) => t.type === type)!;
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
        byType.set(type, { type, count: ids.length, ids });
      } else {
        byType.set(type, { type, count: result.affected ?? 0, ids: [] });
      }
    }

    const entities = REASSIGNMENT_TARGETS.map((t) => byType.get(t.type)!);

    const summary = entities.map((e) => `${e.type}=${e.count}`).join(', ');
    this.logger.log(
      `Reassigned records in company ${companyId} from ${fromUserId} to ${toUserId}: ${summary}`,
    );

    return { fromUserId, toUserId, reason, entities };
  }
}
