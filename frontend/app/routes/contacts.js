import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ContactsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    search: { refreshModel: true },
  };

  async model({ page = 1, limit = 20, search = '' }) {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);

    const result = await this.auth.fetchJson(`/contacts?${params.toString()}`);
    return {
      contacts: result.data?.data || [],
      total: result.data?.total || 0,
      page: result.data?.page || 1,
    };
  }
}
