import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class LeadsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    status: { refreshModel: true },
  };

  async model({ page = 1, limit = 50, status = '' }) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set('status', status);

    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/leads?${params.toString()}`,
    );
    if (!response.ok) return { leads: [], total: 0, page: 1 };
    return response.json().then((r) => r.data);
  }
}
