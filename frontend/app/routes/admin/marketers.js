import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** Report returns companyIds only; loads companies list to resolve names for row expand. */
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

  /** Name map for row expand; pages companies list (capped 2000) to avoid raw UUIDs. */
  async loadCompanyNames() {
    const names = {};
    const limit = 200;
    try {
      const first = await this.auth.fetchJson(
        `/console/companies?page=1&limit=${limit}`,
      );
      for (const c of first?.data?.data ?? []) names[c.id] = c.name;
      const total = first?.data?.total ?? 0;
      const lastPage = Math.min(Math.ceil(total / limit), 10);
      if (lastPage > 1) {
        const rest = await Promise.all(
          Array.from({ length: lastPage - 1 }, (_, i) =>
            this.auth.fetchJson(
              `/console/companies?page=${i + 2}&limit=${limit}`,
            ),
          ),
        );
        for (const res of rest) {
          for (const c of res?.data?.data ?? []) names[c.id] = c.name;
        }
      }
    } catch {
      // Names are decoration for the expand; fall back to UUIDs on failure.
    }
    return names;
  }
}
