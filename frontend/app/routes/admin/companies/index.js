import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** Server-side search/pagination; rail/status filters are client-side on the loaded page. */
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
