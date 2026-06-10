// frontend/app/routes/whatsapp.js
import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class WhatsappRoute extends AuthenticatedRoute {
  @service whatsapp;

  setupController(controller) {
    super.setupController(...arguments);
    controller.setup();
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.teardown();
  }
}
