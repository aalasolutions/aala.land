import Route from '@ember/routing/route';
import { service } from '@ember/service';
import config from 'frontend/config/environment';

export default class SignupRoute extends Route {
  @service session;
  @service router;

  beforeModel(transition) {
    if (this.session.isAuthenticated) {
      this.router.transitionTo('dashboard');
    }
  }

  async model() {
    try {
      const response = await fetch(`${config.APP.API_BASE}/companies/regions`);
      const result = await response.json();
      
      const data = result.data ?? result ?? {};
      const grouped = Array.isArray(data.grouped) ? data.grouped : [];

      return { 
        regions: data.flat || [], 
        grouped: grouped, 
        countries: grouped.map(g => g.countryName)
      };
    } catch {
      return { regions: [], grouped: [], countries: [] };
    }
  }
}
