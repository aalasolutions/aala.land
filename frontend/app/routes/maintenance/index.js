import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { safeJson } from '../../utils/safe-json';

export default class MaintenanceRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    filterStatus: { refreshModel: true },
    filterMonth: { refreshModel: true },
  };

  async model({ page = 1, limit = 50, filterStatus = '', filterMonth = '' }) {
    const maintenanceParams = new URLSearchParams({ page, limit });
    if (filterStatus) {
      maintenanceParams.set('status', filterStatus);
    }
    if (filterMonth) {
      maintenanceParams.set('period', filterMonth);
    }

    const [mainJson, costJson, upcomingJson] = await Promise.all([
      safeJson(
        this.auth,
        `/maintenance?${maintenanceParams.toString()}`,
        'MAINT',
      ),
      safeJson(this.auth, '/maintenance/cost-summary', 'MAINT'),
      safeJson(this.auth, '/maintenance/upcoming', 'MAINT'),
    ]);

    return {
      workOrders: mainJson?.data?.data ?? [],
      costSummary: costJson?.data ?? null,
      upcoming: upcomingJson?.data ?? [],
      total: mainJson?.data?.total ?? 0,
      page,
      limit,
      filterStatus,
      filterMonth,
    };
  }
}
