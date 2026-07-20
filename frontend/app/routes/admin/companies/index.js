import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * Operator console list (design section 3). The old tier+expiry edit modal is
 * absorbed by the company detail page; this page is now the console list.
 * Server-side search + pagination; rail/status are client refinements on the
 * loaded page.
 */
export default class AdminCompaniesIndexRoute extends Route {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    search: { refreshModel: true },
  };

  async model(params) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const query = new URLSearchParams({ page, limit });
    if (params.search) query.set('search', params.search.trim());
    const res = await this.auth.fetchJson(`/console/companies?${query}`);
    return {
      rows: res?.data?.data ?? [],
      total: res?.data?.total ?? 0,
      page: res?.data?.page ?? page,
      limit: res?.data?.limit ?? limit,
    };
  }
}
