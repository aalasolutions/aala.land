import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class MaintenanceRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const safeJson = async (path) => {
      try { return await this.auth.fetchJson(path); }
      catch (e) { console.error('[MAINT-ROUTE] Failed:', path, e.message); return null; }
    };

    const [mainJson, vendorsJson, costJson, upcomingJson, unitsJson] = await Promise.all([
      safeJson(`/maintenance?page=${page}&limit=${limit}`),
      safeJson(`/vendors?page=1&limit=100`),
      safeJson(`/maintenance/cost-summary`),
      safeJson(`/maintenance/upcoming`),
      safeJson(`/properties/units?page=1&limit=500`),
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
