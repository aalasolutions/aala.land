import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class LeasesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [leasesJson, unitsJson] = await Promise.all([
      safeJson(this.auth, `/leases?page=${page}&limit=${limit}`, 'LEASES'),
      safeJson(this.auth, '/properties/units?page=1&limit=100', 'LEASES'),
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
