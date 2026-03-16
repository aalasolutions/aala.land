import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class LeasesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const safeJson = async (path) => {
      try { return await this.auth.fetchJson(path); }
      catch (e) { console.error('[LEASES-ROUTE] Failed:', path, e.message); return null; }
    };

    const [leasesJson, unitsJson] = await Promise.all([
      safeJson(`/leases?page=${page}&limit=${limit}`),
      safeJson(`/properties/units?page=1&limit=100`),
    ]);

    return {
      leases: leasesJson?.data?.data ?? [],
      units: unitsJson?.data?.data ?? [],
      total: leasesJson?.data?.total ?? 0,
      page,
      limit,
    };
  }
}
