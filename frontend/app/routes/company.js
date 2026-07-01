import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class CompanyRoute extends AuthenticatedRoute {
  @service auth;
  @service region;

  async model() {
    if (this.auth.currentUser?.role === 'super_admin') return null;
    const companyId = this.auth.currentUser?.companyId;
    if (!companyId) return null;

    const [companyResult, regionsResponse, storageUsage] = await Promise.all([
      this.auth.fetchJson(`/companies/${companyId}`),
      fetch(`${this.auth.apiBase}/companies/regions`).then((r) => r.json()).catch(() => ({ data: [] })),
      safeJson(this.auth, `/companies/${companyId}/storage-usage`, 'COMPANY'),
    ]);

    const company = companyResult.data || null;
    const regionsData = regionsResponse.data || regionsResponse || {};
    const regions = regionsData.flat || regionsData || [];
    const groupedRegions = regionsData.grouped || [];

    return { company, regions, groupedRegions, storageUsage };
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    const c = model?.company;
    if (c) {
      controller.formName = c.name || '';
      controller.formActiveRegions = c.activeRegions || [];
      controller.formDefaultRegionCode = c.defaultRegionCode || null;
    }
    controller.storageUsage = model.storageUsage?.data ?? null;
  }
}
