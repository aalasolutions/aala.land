import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class CommissionsRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const [commissionsJson, agentsJson] = await Promise.all([
      safeJson(this.auth, '/commissions?page=1&limit=100', 'COMMISSIONS'),
      safeJson(this.auth, '/users/agents', 'COMMISSIONS'),
    ]);

    return {
      commissions: commissionsJson?.data?.data || [],
      agents: agentsJson?.data || [],
    };
  }
}
