import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class AdminCompaniesRoute extends AuthenticatedRoute {
  @service auth;
  @service router;

  beforeModel() {
    super.beforeModel(...arguments);
    if (this.auth.currentUser?.role !== 'super_admin') {
      return this.router.transitionTo('dashboard');
    }
  }

  async model() {
    const response = await this.auth.fetchJson('/companies?limit=200');
    return response?.data?.data || [];
  }
}
