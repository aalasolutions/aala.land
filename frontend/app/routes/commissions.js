import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class CommissionsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const json = await this.auth.fetchJson('/commissions?page=1&limit=100');
    return { commissions: json.data?.data || [] };
  }
}
