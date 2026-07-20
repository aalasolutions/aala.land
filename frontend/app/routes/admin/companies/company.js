import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * Full-page company detail (design section 4, option C1). Real URL, browser
 * back works. The billing state is best-effort on the backend (null when the
 * provider is down), so the page never blanks.
 */
export default class AdminCompaniesCompanyRoute extends Route {
  @service auth;

  async model(params) {
    const res = await this.auth.fetchJson(
      `/console/companies/${params.company_id}`,
    );
    return res?.data ?? null;
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    // Per-company reset: clears tab state, forms and stale sub-lists so a
    // switch between two detail pages never leaks the previous company.
    controller.resetForCompany(model);
  }
}
