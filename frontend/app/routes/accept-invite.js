import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class AcceptInviteRoute extends Route {
  @service session;
  @service router;

  queryParams = {
    token: { refreshModel: false },
  };

  beforeModel(transition) {
    if (this.session.isAuthenticated) {
      this.router.transitionTo('dashboard');
      return;
    }
    const token = transition.to.queryParams?.token;
    if (!token) {
      this.router.transitionTo('login');
    }
  }

  model(params) {
    return { token: params.token };
  }
}
