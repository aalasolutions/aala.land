import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class MaintenanceRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [res, vendorsRes] = await Promise.all([
      this.auth.authorizedFetch(
        `${this.auth.apiBase}/maintenance?page=${page}&limit=${limit}`,
      ),
      this.auth.authorizedFetch(
        `${this.auth.apiBase}/vendors?page=1&limit=100`,
      ),
    ]);

    let workOrders = [];
    let total = 0;
    if (res.ok) {
      const json = await res.json();
      workOrders = json.data?.data ?? [];
      total = json.data?.total ?? 0;
    }

    let vendors = [];
    if (vendorsRes.ok) {
      const vendorsJson = await vendorsRes.json();
      vendors = vendorsJson.data?.data ?? [];
    }

    return { workOrders, vendors, total, page, limit };
  }
}
