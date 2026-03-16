import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class ReportsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    // Fetch each endpoint independently so one failure doesn't blank all data
    const [kpisJson, agentsJson, redFlagsJson, activityJson, funnelJson] = await Promise.all([
      safeJson(this.auth, '/reports/dashboard', 'REPORTS'),
      safeJson(this.auth, '/reports/agent-performance', 'REPORTS'),
      safeJson(this.auth, '/reports/red-flags', 'REPORTS'),
      safeJson(this.auth, '/reports/activity-feed', 'REPORTS'),
      safeJson(this.auth, '/reports/pipeline-funnel', 'REPORTS'),
    ]);

    return {
      kpis: kpisJson?.data ?? null,
      agents: agentsJson?.data ?? [],
      redFlags: redFlagsJson?.data ?? [],
      activity: activityJson?.data ?? [],
      funnel: funnelJson?.data ?? [],
    };
  }
}
