import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class VendorsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 10 }) {
    try {
      const result = await this.auth.fetchJson(`/vendors?page=${page}&limit=${limit}`);
      return {
        vendors: result.data?.data || [],
        total: result.data?.total || 0,
        page,
        limit,
      };
    } catch {
      return {
        vendors: [],
        total: 0,
        page,
        limit,
      };
    }
  }
}
