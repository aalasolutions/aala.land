import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ResetPasswordRoute extends Route {
  @service session;
  @service router;

  queryParams = {
    token: {
      refreshModel: true,
    },
  };

  beforeModel() {
    if (this.session.isAuthenticated) {
      this.router.transitionTo('dashboard');
    }
  }

  model(params) {
    return {
      token: params.token ?? '',
    };
  }
}
