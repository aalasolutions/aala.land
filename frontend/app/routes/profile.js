import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ProfileRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const userId = this.auth.currentUser?.id;
    if (!userId) return null;

    try {
      const json = await this.auth.fetchJson(`/users/${userId}`);
      return json.data;
    } catch {
      return null;
    }
  }
}
