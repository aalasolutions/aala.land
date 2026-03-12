import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class LeadsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    status: { refreshModel: true },
  };

  async model({ page = 1, limit = 50, status = '' }) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set('status', status);

    try {
      const json = await this.auth.fetchJson(`/leads?${params.toString()}`);
      return json.data;
    } catch {
      return { leads: [], total: 0, page: 1 };
    }
  }

  setupController(controller) {
    super.setupController(...arguments);
    controller.loadAgents();
  }
}
