import AuthenticatedRoute from './authenticated';

export default class CheckoutRoute extends AuthenticatedRoute {
  setupController(controller) {
    super.setupController(...arguments);
    controller.start();
  }

  deactivate() {
    super.deactivate(...arguments);
    this.controllerFor('checkout').stop();
  }
}
