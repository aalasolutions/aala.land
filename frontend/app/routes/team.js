import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { canManageUsers } from '../utils/roles';
import { safeJson } from '../utils/safe-json';

export default class TeamRoute extends AuthenticatedRoute {
  @service router;
  @service auth;

  async beforeModel(transition) {
    await super.beforeModel(transition);

    const role = this.auth.currentUser?.role;

    if (!canManageUsers(role)) {
      return this.router.transitionTo('dashboard');
    }
  }

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 10 }) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const companyId = this.auth.currentUser?.companyId;

    const [usersJson, usage] = await Promise.all([
      safeJson(this.auth, `/users?${params.toString()}`, 'TEAM'),
      companyId
        ? safeJson(this.auth, `/companies/${companyId}/storage-usage`, 'TEAM')
        : Promise.resolve(null),
    ]);

    return {
      users: usersJson?.data?.data || [],
      total: usersJson?.data?.total || 0,
      page: usersJson?.data?.page || 1,
      seatInfo: usage?.data
        ? {
            purchasedSeats: usage.data.purchasedSeats ?? 1,
            tier: usage.data.tier ?? 'FREE',
          }
        : null,
    };
  }
}
