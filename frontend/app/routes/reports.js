import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ReportsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const [kpisRes, agentsRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/dashboard`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/reports/agent-performance`),
    ]);

    const kpis = kpisRes.ok ? (await kpisRes.json()).data : null;
    const agents = agentsRes.ok ? (await agentsRes.json()).data : [];

    return { kpis, agents };
  }
}
