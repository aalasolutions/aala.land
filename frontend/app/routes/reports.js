import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ReportsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const [kpisRes, agentsRes, redFlagsRes, activityRes, funnelRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/dashboard`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/agent-performance`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/red-flags`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/activity-feed`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/pipeline-funnel`),
    ]);

    const kpis = kpisRes.ok ? (await kpisRes.json()).data : null;
    const agents = agentsRes.ok ? (await agentsRes.json()).data : [];
    const redFlags = redFlagsRes.ok ? (await redFlagsRes.json()).data : [];
    const activity = activityRes.ok ? (await activityRes.json()).data : [];
    const funnel = funnelRes.ok ? (await funnelRes.json()).data : [];

    return { kpis, agents, redFlags, activity, funnel };
  }
}
