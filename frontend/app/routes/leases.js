import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class LeasesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [leasesRes, unitsRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/leases?page=${page}&limit=${limit}`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/properties/units?page=1&limit=100`),
    ]);
    if (!leasesRes.ok) return { leases: [], units: [], total: 0, page: 1, limit: 20 };
    const leasesJson = await leasesRes.json();
    const units = unitsRes.ok ? (await unitsRes.json()).data?.data ?? [] : [];
    return {
      leases: leasesJson.data?.data ?? [],
      units,
      total: leasesJson.data?.total ?? 0,
      page,
      limit,
    };
  }
}
