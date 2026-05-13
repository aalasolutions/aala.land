import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ProfileRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    try {
      const json = await this.auth.fetchJson('/users/me');
      return json.data;
    } catch (error) {
      console.error('Failed to load user profile:', error);
      return null;
    }
  }
}
