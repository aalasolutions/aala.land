import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, EntityTarget } from 'typeorm';
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

// No WhatsApp target and no row-moving method here: a chat belongs to one agent's own connected number, so it stays with the departing agent as the company record while only the lead moves.

// Execution order is lock-safe: lead and work order before unit, unit before document.
const REASSIGNMENT_EXECUTION_ORDER: ReassignedEntityType[] = [
  'lead',
  'work_order',
  'unit',
  'document',
  'commission',
  'contact',
];

@Injectable()
export class UserReassignmentService {
  private readonly logger = new Logger(UserReassignmentService.name);

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
