import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service session;
  @service auth;

  async beforeModel() {
    if (!this.session.isAuthenticated) {
      return;
    }

    this.auth.loadUiSettings();

    // Refreshes account on boot so role/tier changes apply without re-login; fails open on error.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const { data } = await this.auth.fetchJson('/auth/profile', {
        signal: controller.signal,
      });
      this.session.hydrate(data);
    } catch {
      // fail open
    } finally {
      clearTimeout(timeout);
    }
  }

  setupController(controller) {
    super.setupController(...arguments);
    controller.loadUnreadCount();
  }
}
