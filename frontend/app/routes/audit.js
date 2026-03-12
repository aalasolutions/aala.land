import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

const AUDIT_ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'ASSIGN', label: 'Assign' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'IMPORT', label: 'Import' },
  { value: 'EXPORT', label: 'Export' },
];

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'User', label: 'User' },
  { value: 'Lead', label: 'Lead' },
  { value: 'PropertyArea', label: 'Area' },
  { value: 'Building', label: 'Building' },
  { value: 'Unit', label: 'Unit' },
  { value: 'Owner', label: 'Owner' },
  { value: 'Lease', label: 'Lease' },
  { value: 'WorkOrder', label: 'Work Order' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Transaction', label: 'Transaction' },
];

export default class AuditRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    action: { refreshModel: true },
    entityType: { refreshModel: true },
  };

  async model(params) {
    const { page = 1, limit = 50, action = '', entityType = '' } = params;
    const queryParams = new URLSearchParams({ page, limit });
    if (action) queryParams.set('action', action);
    if (entityType) queryParams.set('entityType', entityType);

    try {
      const json = await this.auth.fetchJson(`/audit-logs?${queryParams.toString()}`);
      return {
        logs: json.data?.data || [],
        total: json.data?.total || 0,
        page: json.data?.page || 1,
        auditActions: AUDIT_ACTIONS,
        entityTypes: ENTITY_TYPES,
      };
    } catch (e) {
      return {
        logs: [],
        total: 0,
        page: 1,
        forbidden: e?.status === 403,
        auditActions: AUDIT_ACTIONS,
        entityTypes: ENTITY_TYPES,
      };
    }
  }
}
