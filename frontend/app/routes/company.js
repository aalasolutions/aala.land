import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class CompanyRoute extends AuthenticatedRoute {
  @service auth;
  @service region;

  async model() {
    const companyId = this.auth.currentUser?.companyId;
    if (!companyId) return null;

    const [companyResult, regionsResponse] = await Promise.all([
      this.auth.fetchJson(`/companies/${companyId}`),
      fetch(`${this.auth.apiBase}/companies/regions`).then((r) => r.json()).catch(() => ({ data: [] })),
    ]);

    const company = companyResult.data || null;
    const regionsData = regionsResponse.data || regionsResponse || {};
    const regions = regionsData.flat || regionsData || [];
    const groupedRegions = regionsData.grouped || [];

    return { company, regions, groupedRegions };
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    const c = model?.company;
    if (c) {
      controller.formName = c.name || '';
      controller.formActiveRegions = c.activeRegions || [];
      controller.formDefaultRegionCode = c.defaultRegionCode || null;
    }
  }
}
