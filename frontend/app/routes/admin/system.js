import Route from '@ember/routing/route';
import { service } from '@ember/service';

/**
 * System health (design section 10). Reading price-health auto-syncs any
 * unregistered rows on the backend, so the operator usually sees OK on load.
 */
export default class AdminSystemRoute extends Route {
  @service auth;

  async model() {
    const res = await this.auth.fetchJson('/console/system/price-health');
    return res?.data ?? null;
  }
}
