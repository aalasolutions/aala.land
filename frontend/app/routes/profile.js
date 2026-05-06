import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ProfileRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const json = await this.auth.fetchJson('/users/me');
    return json.data;
  }
}
