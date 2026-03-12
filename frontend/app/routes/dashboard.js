import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class DashboardRoute extends AuthenticatedRoute {
  @service auth;

  async model() {
    const [kpisRes, activityRes, pipelineRes] = await Promise.all([
      this.auth.fetchJson('/reports/dashboard').catch(() => null),
      this.auth.fetchJson('/reports/activity-feed').catch(() => null),
      this.auth.fetchJson('/reports/pipeline-funnel').catch(() => null),
    ]);

    return {
      kpis: kpisRes?.data ?? null,
      activity: activityRes?.data ?? [],
      pipeline: pipelineRes?.data ?? [],
    };
  }
}
