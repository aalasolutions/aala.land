import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class OwnersDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model(params) {
    try {
      const json = await this.auth.fetchJson(`/owners/${params.owner_id}`);
      return { owner: json.data };
    } catch {
      return { owner: null, units: [], financialSummary: null };
    }
  }
}
