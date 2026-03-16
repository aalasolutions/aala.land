import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class CommissionsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const safeJson = async (path) => {
      try { return await this.auth.fetchJson(path); }
      catch (e) { console.error('[COMMISSIONS-ROUTE] Failed:', path, e.message); return null; }
    };

    const [commissionsJson, agentsJson] = await Promise.all([
      safeJson('/commissions?page=1&limit=100'),
      safeJson('/users/agents'),
    ]);

    return {
      commissions: commissionsJson?.data?.data || [],
      agents: agentsJson?.data || [],
    };
  }
}
