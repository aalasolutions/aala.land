import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** Real URL so back works; billing state is best-effort (null if provider is down). */
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
    // Clears tab state, forms and sub-lists so switching companies never leaks the old one.
    controller.resetForCompany(model);
  }
}
