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

    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/owners?${params.toString()}`,
    );
    if (!response.ok) return { owners: [], total: 0, page: 1 };
    const result = await response.json();
    return { owners: result.data?.data || [], total: result.data?.total || 0, page: result.data?.page || 1 };
  }
}
