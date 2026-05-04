import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ContactsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    search: { refreshModel: true },
  };

  async model({ page = 1, limit = 10, search = '' }) {
    try {
      const params = new URLSearchParams({ page, limit });
      if (search) params.set('search', search);

      const result = await this.auth.fetchJson(`/contacts?${params.toString()}`);
      return {
        contacts: result.data?.data || [],
        total: result.data?.total || 0,
        page: result.data?.page || 1,
        limit: result.data?.limit || limit,
      };
    } catch {
      return { contacts: [], total: 0, page: 1, limit };
    }
  }
}
