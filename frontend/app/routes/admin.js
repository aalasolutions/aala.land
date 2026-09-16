import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { isSuperAdmin } from '../utils/roles';

/** Gates the whole Admin group to super_admin so no child re-checks the role manually. */
export default class AdminRoute extends AuthenticatedRoute {
  @service auth;
  @service router;

  beforeModel(transition) {
    super.beforeModel(transition);
    if (!isSuperAdmin(this.auth.currentUser?.role)) {
      return this.router.transitionTo('dashboard');
    }
  }
}
