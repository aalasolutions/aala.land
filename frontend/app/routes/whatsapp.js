import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { canAccessWhatsapp } from '../utils/roles';

export default class WhatsappRoute extends AuthenticatedRoute {
  @service whatsapp;
  @service router;
  @service auth;

  async beforeModel(transition) {
    await super.beforeModel(transition);

    if (!canAccessWhatsapp(this.auth.currentUser?.role)) {
      return this.router.transitionTo('dashboard');
    }
  }

  setupController(controller) {
    super.setupController(...arguments);
    controller.setup();
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.teardown();
  }
}
