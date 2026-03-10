import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class EmailTemplatesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    category: { refreshModel: true },
  };

  async model({ page = 1, limit = 20, category = '' }) {
    const params = new URLSearchParams({ page, limit });
    if (category) params.set('category', category);

    const result = await this.auth.fetchJson(`/email-templates?${params.toString()}`);
    return {
      templates: result.data?.data || [],
      total: result.data?.total || 0,
      page: result.data?.page || 1,
    };
  }
}
