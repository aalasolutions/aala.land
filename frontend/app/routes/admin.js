import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { isSuperAdmin } from '../utils/roles';

/**
 * Operator console root. Gates the whole Admin group to super_admin; every
 * nested screen (overview, companies, marketers, system) inherits this
 * beforeModel, so no child re-checks the role with a raw string.
 */
export default class AdminRoute extends AuthenticatedRoute {
  @service auth;
  @service router;

  beforeModel(transition) {
    super.beforeModel(transition);
    if (!isSuperAdmin(this.auth.currentUser?.role)) {
      this.router.transitionTo('dashboard');
    }
  }
}
