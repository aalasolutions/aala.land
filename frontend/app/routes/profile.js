import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ProfileRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const userId = this.auth.currentUser?.id;
    if (!userId) return null;

    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/users/${userId}`,
    );
    if (!response.ok) return null;
    return response.json().then((r) => r.data);
  }
}
