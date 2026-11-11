import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** Backend RegisterDto/GoogleSignupDto cap marketerCode at 64 chars. */
const MARKETER_CODE_MAX = 64;

export default class SignupRoute extends Route {
  @service session;
  @service router;

  queryParams = {
    ref: { refreshModel: false },
  };

  beforeModel() {
    if (this.session.isAuthenticated) {
      this.router.transitionTo('dashboard');
    }
  }

  /** ?ref=CODE, trimmed and capped to the DTO limit; null when absent. */
  resolveMarketerCode(ref) {
    const code = typeof ref === 'string' ? ref.trim() : '';
    return code ? code.slice(0, MARKETER_CODE_MAX) : null;
  }

  model(params) {
    return { marketerCode: this.resolveMarketerCode(params.ref) };
  }
}
