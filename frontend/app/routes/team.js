import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { canManageUsers } from '../utils/roles';

export default class TeamRoute extends AuthenticatedRoute {
  @service router;
  @service auth;

  beforeModel() {
    const role = this.auth.currentUser?.role;
    if (!canManageUsers(role)) {
      this.router.transitionTo('dashboard');
    }
  }

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 10 }) {
    const params = new URLSearchParams({ page, limit });

    try {
      const json = await this.auth.fetchJson(`/users?${params.toString()}`);
      return { users: json.data?.data || [], total: json.data?.total || 0, page: json.data?.page || 1 };
    } catch {
      return { users: [], total: 0, page: 1 };
    }
  }
}
