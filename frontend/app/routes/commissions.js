import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class CommissionsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    filterStatus: { refreshModel: true },
  };

  async model({ page = 1, limit = 10, filterStatus = '' }) {
    const params = new URLSearchParams({ page, limit });
    if (filterStatus) {
      params.set('status', filterStatus);
    }

    const [commissionsJson, agentsJson] = await Promise.all([
      safeJson(this.auth, `/commissions?${params.toString()}`, 'COMMISSIONS'),
      safeJson(this.auth, '/users/agents', 'COMMISSIONS'),
    ]);

    return {
      commissions: commissionsJson?.data?.data || [],
      total: commissionsJson?.data?.total || 0,
      page,
      limit,
      filterStatus,
      agents: agentsJson?.data || [],
    };
  }
}
