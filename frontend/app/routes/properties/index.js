import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesIndexRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/properties/areas?page=${page}&limit=${limit}`,
    );
    if (!response.ok) return [];
    const json = await response.json();
    return json.data?.data ?? [];
  }
}
