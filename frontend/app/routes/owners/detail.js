import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class OwnersDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model(params) {
    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/owners/${params.owner_id}`,
    );
    if (!response.ok) {
      return { owner: null, units: [], financialSummary: null };
    }
    const result = await response.json();
    const owner = result.data;

    return { owner };
  }
}
