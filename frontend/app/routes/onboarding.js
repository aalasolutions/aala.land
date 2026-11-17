import Route from '@ember/routing/route';
import { service } from '@ember/service';
import config from 'land/config/environment';

export default class OnboardingRoute extends Route {
  @service session;
  @service router;

  beforeModel() {
    if (!this.session.isAuthenticated) {
      this.router.transitionTo('login');
    } else if (!this.session.needsOnboarding) {
      this.router.transitionTo('dashboard');
    }
  }

  async model() {
    try {
      const response = await fetch(`${config.APP.API_BASE}/companies/regions`);
      if (!response.ok) return { grouped: [], loadFailed: true };
      const result = await response.json();
      const data = result?.data ?? result ?? {};
      if (!Array.isArray(data.grouped)) {
        return { grouped: [], loadFailed: true };
      }
      return { grouped: data.grouped, loadFailed: false };
    } catch {
      return { grouped: [], loadFailed: true };
    }
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.reset();
  }
}
