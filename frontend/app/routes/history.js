import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class HistoryRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    filterAction: { refreshModel: true },
    filterEntityType: { refreshModel: true },
  };

  async model(params) {
    const {
      page = 1,
      limit = 10,
      filterAction = '',
      filterEntityType = '',
    } = params;
    const queryParams = new URLSearchParams({ page, limit });
    if (filterAction) queryParams.set('action', filterAction);
    if (filterEntityType) queryParams.set('entityType', filterEntityType);

    try {
      const json = await this.auth.fetchJson(
        `/record-history?${queryParams.toString()}`,
      );
      return {
        entries: json?.data?.data || [],
        total: json?.data?.total || 0,
      };
    } catch (e) {
      const forbidden = e?.status === 403;
      return {
        entries: [],
        total: 0,
        forbidden,
        error: forbidden ? '' : e?.message || 'Failed to load history',
      };
    }
  }
}
