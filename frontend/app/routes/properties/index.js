import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesIndexRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    try {
      const json = await this.auth.fetchJson(`/properties/areas?page=${page}&limit=${limit}`);
      return json.data?.data ?? [];
    } catch {
      return [];
    }
  }
}
