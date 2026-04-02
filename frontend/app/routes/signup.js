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
      const regions = Array.isArray(result) ? result : (result.data || []);

      // Group regions by country
      const grouped = {};
      for (const r of regions) {
        if (!grouped[r.country]) {
          grouped[r.country] = [];
        }
        grouped[r.country].push(r);
      }

      return { regions, grouped, countries: Object.keys(grouped).sort() };
    } catch {
      return { regions: [], grouped: {}, countries: [] };
    }
  }
}
