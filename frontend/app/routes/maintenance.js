import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class MaintenanceRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [mainJson, vendorsJson, costJson, upcomingJson, unitsJson] = await Promise.all([
      safeJson(this.auth, `/maintenance?page=${page}&limit=${limit}`, 'MAINT'),
      safeJson(this.auth, '/vendors?page=1&limit=100', 'MAINT'),
      safeJson(this.auth, '/maintenance/cost-summary', 'MAINT'),
      safeJson(this.auth, '/maintenance/upcoming', 'MAINT'),
      safeJson(this.auth, '/properties/units?page=1&limit=500', 'MAINT'),
    ]);

    return {
      workOrders: mainJson?.data?.data ?? [],
      vendors: vendorsJson?.data?.data ?? [],
      costSummary: costJson?.data ?? null,
      upcoming: upcomingJson?.data ?? [],
      units: unitsJson?.data?.data ?? [],
      total: mainJson?.data?.total ?? 0,
      page,
      limit,
    };
  }
}
