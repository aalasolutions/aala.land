import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * Scoreboard (design section 2). Loads the business numbers and the upcoming
 * manual-payments rollup in one pass; a failure of either surface degrades to
 * an empty state rather than blanking the page.
 */
export default class AdminOverviewRoute extends Route {
  @service auth;

  async model() {
    const [overviewRes, upcomingRes] = await Promise.all([
      this.auth.fetchJson('/console/overview'),
      this.auth.fetchJson('/console/payments/upcoming?days=14'),
    ]);
    return {
      overview: overviewRes?.data ?? null,
      upcoming: upcomingRes?.data ?? { days: 14, rows: [] },
    };
  }
}
