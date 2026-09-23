import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';
import { canViewReports } from '../utils/roles';

export default class ReportsRoute extends AuthenticatedRoute {
  @service auth;
  @service router;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async beforeModel(transition) {
    await super.beforeModel(transition);

    if (!canViewReports(this.auth.currentUser?.role)) {
      return this.router.transitionTo('dashboard');
    }
  }

  async model({ page = 1, limit = 50 }) {
    const activityQuery = new URLSearchParams({ page, limit });

    // Fetch each endpoint independently so one failure doesn't blank all data
    const [
      kpisJson,
      revenueJson,
      agentsJson,
      redFlagsJson,
      activityJson,
      funnelJson,
    ] = await Promise.all([
      safeJson(this.auth, '/reports/dashboard', 'REPORTS'),
      safeJson(this.auth, '/reports/revenue-trend', 'REPORTS'),
      safeJson(this.auth, '/reports/agent-performance', 'REPORTS'),
      safeJson(this.auth, '/reports/red-flags', 'REPORTS'),
      safeJson(
        this.auth,
        `/reports/activity-feed?${activityQuery.toString()}`,
        'REPORTS',
      ),
      safeJson(this.auth, '/reports/pipeline-funnel', 'REPORTS'),
    ]);

    return {
      kpis: kpisJson?.data ?? null,
      revenueTrend: revenueJson?.data ?? [],
      agents: agentsJson?.data ?? [],
      redFlags: redFlagsJson?.data ?? [],
      activity: activityJson?.data?.data ?? [],
      total: activityJson?.data?.total ?? 0,
      funnel: funnelJson?.data ?? [],
    };
  }
}
