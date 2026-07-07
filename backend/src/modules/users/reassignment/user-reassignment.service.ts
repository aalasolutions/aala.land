import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { PropertyDocument } from '../../properties/entities/property-document.entity';
import { Owner } from '../../owners/entities/owner.entity';
import { Commission, CommissionStatus } from '../../commissions/entities/commission.entity';
import { WorkOrder } from '../../maintenance/entities/work-order.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { ReassignedEntityType, ReassignmentReport } from './reassignment-report';

interface ReassignmentTarget {
    type: ReassignedEntityType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entity: any;
    setProperty: string;   // entity property written with the new owner id
    column: string;        // snake_case DB column matched in the WHERE clause
    extraWhere?: string;
    extraParams?: Record<string, unknown>;
}

// Order matches the frozen ReassignedEntityType union (contract section 12).
const REASSIGNMENT_TARGETS: ReassignmentTarget[] = [
    { type: 'lead', entity: Lead, setProperty: 'assignedTo', column: 'assigned_to' },
    { type: 'document', entity: PropertyDocument, setProperty: 'uploadedBy', column: 'uploaded_by' },
    { type: 'owner', entity: Owner, setProperty: 'assignedAgentId', column: 'assigned_agent_id' },
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
    { type: 'work_order', entity: WorkOrder, setProperty: 'assignedTo', column: 'assigned_to' },
    { type: 'contact', entity: Contact, setProperty: 'createdBy', column: 'created_by' },
];

@Injectable()
export class UserReassignmentService {
    private readonly logger = new Logger(UserReassignmentService.name);

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

            const result = await (collectIds ? query.returning('id') : query).execute();

            if (collectIds) {
                const ids = (result.raw as Array<{ id: string }>).map((row) => row.id);
                entities.push({ type: target.type, count: ids.length, ids });
            } else {
                entities.push({ type: target.type, count: result.affected ?? 0, ids: [] });
            }
        }

        const summary = entities.map((e) => `${e.type}=${e.count}`).join(', ');
        this.logger.log(
            `Reassigned records in company ${companyId} from ${fromUserId} to ${toUserId}: ${summary}`,
        );

        return { fromUserId, toUserId, reason, entities };
    }
}
