import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class DashboardRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const failed = [];
    const load = (path) =>
      this.auth.fetchJson(path).catch(() => {
        failed.push(path);
        return null;
      });

    const [kpisRes, ownershipRes, revenueRes] = await Promise.all([
      load('/reports/dashboard'),
      load('/reports/lead-ownership'),
      load('/reports/revenue-trend'),
    ]);

    return {
      failed,
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
