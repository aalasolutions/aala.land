import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { canApproveContactAccess } from '../utils/roles';

export default class AccessRequestsRoute extends AuthenticatedRoute {
  @service auth;
  @service router;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    status: { refreshModel: true },
  };

  // Routes carry no role guard, so agents and accountants are sent home here.
  async beforeModel(transition) {
    await super.beforeModel(transition);

    if (!canApproveContactAccess(this.auth.currentUser?.role)) {
      return this.router.transitionTo('dashboard');
    }
  }

  async model({ page = 1, limit = 50, status = 'PENDING' }) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set('status', status);

    try {
      const json = await this.auth.fetchJson(
        `/contact-access-requests?${params.toString()}`,
      );
      return {
        requests: json?.data?.data ?? [],
        total: json?.data?.total ?? 0,
        error: '',
      };
    } catch (e) {
      return {
        requests: [],
        total: 0,
        error: e?.message || 'Could not load access requests',
      };
    }
  }
}
