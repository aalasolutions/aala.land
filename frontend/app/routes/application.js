import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service session;

  beforeModel() {
    if (this.session.isAuthenticated) {
      return;
    }
  }

  setupController(controller) {
    super.setupController(...arguments);
    controller.loadUnreadCount();
  }
}
