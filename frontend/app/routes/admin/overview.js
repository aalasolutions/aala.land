import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** Loads business numbers and payments rollup together; either failure degrades gracefully. */
export default class AdminOverviewRoute extends Route {
  @service auth;

  async model() {
    const [overviewRes, upcomingRes] = await Promise.allSettled([
      this.auth.fetchJson('/console/overview'),
      this.auth.fetchJson('/console/payments/upcoming?days=14'),
    ]);
    return {
      overview:
        overviewRes.status === 'fulfilled'
          ? (overviewRes.value?.data ?? null)
          : null,
      upcoming:
        upcomingRes.status === 'fulfilled'
          ? (upcomingRes.value?.data ?? { days: 14, rows: [] })
          : { days: 14, rows: [] },
    };
  }
}
