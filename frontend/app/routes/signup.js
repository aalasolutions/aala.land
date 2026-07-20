import Route from '@ember/routing/route';
import { service } from '@ember/service';
import config from 'land/config/environment';

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

  async model(params) {
    const marketerCode = this.resolveMarketerCode(params.ref);
    try {
      const response = await fetch(`${config.APP.API_BASE}/companies/regions`);
      const result = await response.json();

      const data = result.data ?? result ?? {};
      const grouped = Array.isArray(data.grouped) ? data.grouped : [];

      return {
        regions: data.flat || [],
        grouped: grouped,
        countries: grouped.map((g) => g.countryName),
        marketerCode,
      };
    } catch {
      return { regions: [], grouped: [], countries: [], marketerCode };
    }
  }
}
