import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from 'land/constants';

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
      const json = await this.auth.fetchJson(
        `/audit-logs?${queryParams.toString()}`,
      );
      return {
        logs: json.data?.data || [],
        total: json.data?.total || 0,
        page: json.data?.page || 1,
        auditActions: AUDIT_ACTIONS,
        entityTypes: AUDIT_ENTITY_TYPES,
      };
    } catch (e) {
      return {
        logs: [],
        total: 0,
        page: 1,
        forbidden: e?.status === 403,
        auditActions: AUDIT_ACTIONS,
        entityTypes: AUDIT_ENTITY_TYPES,
      };
    }
  }
}
