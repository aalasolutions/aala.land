import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class MaintenanceRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const res = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/maintenance?page=${page}&limit=${limit}`,
    );
    if (!res.ok) return { workOrders: [], total: 0, page: 1, limit: 20 };
    const json = await res.json();
    return { workOrders: json.data?.data ?? [], total: json.data?.total ?? 0, page, limit };
  }
}
