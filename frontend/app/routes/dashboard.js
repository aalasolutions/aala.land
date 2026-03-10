import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class DashboardRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const response = await this.auth.authorizedFetch(`${this.auth.apiBase}/reports/dashboard`);
    if (!response.ok) return { kpis: null };
    const { data } = await response.json();
    return { kpis: data };
  }
}
