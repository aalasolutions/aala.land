import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * MRR by marketer code (design section 9). The report returns companyIds only,
 * so we also load the companies list to resolve names for the row expand.
 */
export default class AdminMarketersRoute extends Route {
  @service auth;

  async model() {
    const [reportRes, companyNames] = await Promise.all([
      this.auth.fetchJson('/console/reports/marketers'),
      this.loadCompanyNames(),
    ]);
    return {
      rows: reportRes?.data?.rows ?? [],
      companyNames,
    };
  }

  /**
   * Name map for the row expand. Pages through the companies list until
   * exhausted (capped at 10 pages / 2000 companies) so the expand never
   * shows raw UUIDs once the fleet outgrows one page.
   */
  async loadCompanyNames() {
    const names = {};
    const limit = 200;
    for (let page = 1; page <= 10; page++) {
      const res = await this.auth.fetchJson(
        `/console/companies?page=${page}&limit=${limit}`,
      );
      const rows = res?.data?.data ?? [];
      for (const c of rows) names[c.id] = c.name;
      const total = res?.data?.total ?? 0;
      if (rows.length === 0 || page * limit >= total) break;
    }
    return names;
  }
}
