import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class OwnersIndexRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const params = new URLSearchParams({ page, limit });

    try {
      const json = await this.auth.fetchJson(`/owners?${params.toString()}`);
      return { owners: json.data?.data || [], total: json.data?.total || 0, page: json.data?.page || 1 };
    } catch {
      return { owners: [], total: 0, page: 1 };
    }
  }
}
