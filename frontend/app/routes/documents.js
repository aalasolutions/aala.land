import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { localMidnightIso } from 'land/utils/local-date';

export default class DocumentsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    category: { refreshModel: true },
    search: { refreshModel: true },
    accessLevel: { refreshModel: true },
    dateFrom: { refreshModel: true },
    dateTo: { refreshModel: true },
  };

  async model({
    page = 1,
    limit = 10,
    category = '',
    search = '',
    accessLevel = '',
    dateFrom = '',
    dateTo = '',
  }) {
    try {
      const params = new URLSearchParams({ page, limit });
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      if (accessLevel) params.set('accessLevel', accessLevel);
      const fromIso = localMidnightIso(dateFrom);
      const toIso = localMidnightIso(dateTo, 1);
      if (fromIso) params.set('dateFrom', fromIso);
      if (toIso) params.set('dateTo', toIso);

      const result = await this.auth.fetchJson(
        `/documents?${params.toString()}`,
      );
      return {
        documents: result.data?.data || [],
        total: result.data?.total || 0,
        page: result.data?.page || 1,
      };
    } catch {
      return { documents: [], total: 0, page: 1 };
    }
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.resetState();
  }
}
