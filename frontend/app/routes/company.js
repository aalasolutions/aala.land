import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class CompanyRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const companyId = this.auth.currentUser?.companyId;
    if (!companyId) return null;

    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/companies/${companyId}`,
    );
    if (!response.ok) return null;
    return response.json().then((r) => r.data);
  }
}
