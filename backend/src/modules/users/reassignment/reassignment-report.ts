export type ReassignedEntityType =
    | 'lead'            // leads.assigned_to
    | 'document'        // property_documents.uploaded_by
    | 'owner'           // owners.assigned_agent_id
    | 'commission'      // commissions.agent_id, PENDING status only
    | 'work_order'      // work_orders.assigned_to
    | 'contact';        // contacts.created_by (column added by unit 5, migration 1779500000041)

export interface ReassignmentReport {
    fromUserId: string;
    toUserId: string;
    reason: string;
    entities: Array<{ type: ReassignedEntityType; count: number; ids: string[] }>;
}
