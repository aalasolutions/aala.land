import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service session;
  @service auth;

  async beforeModel() {
    if (!this.session.isAuthenticated) {
      return;
    }

    // Refresh account state on boot so a role/region/tier change made
    // outside this session (e.g. by a super admin) doesn't require a
    // re-login to take effect. Fails open: a network/server error keeps
    // the cached session data rather than blocking app load. An invalid
    // token still gets caught by authorizedFetch's existing 401 handling.
    try {
      const { data } = await this.auth.fetchJson('/auth/profile');
      this.session.hydrate(data);
    } catch {
      // fail open
    }
  }

  setupController(controller) {
    super.setupController(...arguments);
    controller.loadUnreadCount();
  }
}
