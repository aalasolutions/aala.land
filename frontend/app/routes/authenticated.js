import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class AuthenticatedRoute extends Route {
  @service session;
  @service router;

  beforeModel(transition) {
    if (!this.session.isAuthenticated) {
      this.session.requireAuthentication(transition, 'login');
      return;
    }
    if (this.session.needsOnboarding) {
      this.router.transitionTo('onboarding');
    }
  }
}
