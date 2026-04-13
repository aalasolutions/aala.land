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
      const json = await this.auth.fetchJson('/locations/company/localities');
      return json.data ?? [];
    } catch {
      return [];
    }
  }
}
