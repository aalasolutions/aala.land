import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class VendorsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const result = await this.auth.fetchJson('/vendors?page=1&limit=100');
    return {
      vendors: result.data?.data || [],
    };
  }
}
