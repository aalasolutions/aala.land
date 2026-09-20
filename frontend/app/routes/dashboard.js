import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class DashboardRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const [kpisRes, ownershipRes, revenueRes] = await Promise.all([
      this.auth.fetchJson('/reports/dashboard').catch(() => null),
      this.auth.fetchJson('/reports/lead-ownership').catch(() => null),
      this.auth.fetchJson('/reports/revenue-trend').catch(() => null),
    ]);

    return {
      kpis: kpisRes?.data ?? null,
      ownership: ownershipRes?.data ?? {
        agents: [],
        pipeline: [],
        won: 0,
        lost: 0,
        unassignedOpen: 0,
      },
      revenueTrend: revenueRes?.data ?? [],
    };
  }
}
