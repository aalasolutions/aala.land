import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';
import { canViewReports } from '../utils/roles';

export default class ReportsRoute extends AuthenticatedRoute {
  @service auth;
  @service region;
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

  staticReports = null;

  // A region switch also refreshes from `reports`, so the static-report cache is keyed by region.
  async model({ page = 1, limit = 50 }, transition) {
    const regionCode = this.region.regionCode;
    const pagingOnly =
      transition.from?.name === 'reports' &&
      this.staticReports?.regionCode === regionCode;
    const activityQuery = new URLSearchParams({ page, limit });
    const [staticReports, activityJson] = await Promise.all([
      pagingOnly ? this.staticReports.reports : this.loadStaticReports(),
      safeJson(
        this.auth,
        `/reports/activity-feed?${activityQuery.toString()}`,
        'REPORTS',
      ),
    ]);
    this.staticReports = { regionCode, reports: staticReports };

    return {
      ...staticReports,
      activity: activityJson?.data?.data ?? [],
      total: activityJson?.data?.total ?? 0,
    };
  }

  // Fetch each endpoint independently so one failure doesn't blank all data
  async loadStaticReports() {
    const [kpisJson, revenueJson, agentsJson, redFlagsJson, funnelJson] =
      await Promise.all([
        safeJson(this.auth, '/reports/dashboard', 'REPORTS'),
        safeJson(this.auth, '/reports/revenue-trend', 'REPORTS'),
        safeJson(this.auth, '/reports/agent-performance', 'REPORTS'),
        safeJson(this.auth, '/reports/red-flags', 'REPORTS'),
        safeJson(this.auth, '/reports/pipeline-funnel', 'REPORTS'),
      ]);

    return {
      kpis: kpisJson?.data ?? null,
      revenueTrend: revenueJson?.data ?? [],
      agents: agentsJson?.data ?? [],
      redFlags: redFlagsJson?.data ?? [],
      funnel: funnelJson?.data ?? [],
    };
  }
}
