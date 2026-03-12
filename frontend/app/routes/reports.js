import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ReportsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    try {
      const [kpisJson, agentsJson, redFlagsJson, activityJson, funnelJson] = await Promise.all([
        this.auth.fetchJson(`/reports/dashboard`),
        this.auth.fetchJson(`/reports/agent-performance`),
        this.auth.fetchJson(`/reports/red-flags`),
        this.auth.fetchJson(`/reports/activity-feed`),
        this.auth.fetchJson(`/reports/pipeline-funnel`),
      ]);

      return {
        kpis: kpisJson.data ?? null,
        agents: agentsJson.data ?? [],
        redFlags: redFlagsJson.data ?? [],
        activity: activityJson.data ?? [],
        funnel: funnelJson.data ?? [],
      };
    } catch {
      return { kpis: null, agents: [], redFlags: [], activity: [], funnel: [] };
    }
  }
}
