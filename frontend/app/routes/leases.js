import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class LeasesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    try {
      const [leasesJson, unitsJson] = await Promise.all([
        this.auth.fetchJson(`/leases?page=${page}&limit=${limit}`),
        this.auth.fetchJson(`/properties/units?page=1&limit=100`),
      ]);

      return {
        leases: leasesJson.data?.data ?? [],
        units: unitsJson.data?.data ?? [],
        total: leasesJson.data?.total ?? 0,
        page,
        limit,
      };
    } catch {
      return { leases: [], units: [], total: 0, page: 1, limit: 20 };
    }
  }
}
