import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** Reading price-health auto-syncs unregistered rows, so operator usually sees OK on load. */
export default class AdminSystemRoute extends Route {
  @service auth;

  async model() {
    const res = await this.auth.fetchJson('/console/system/price-health');
    return res?.data ?? null;
  }
}
