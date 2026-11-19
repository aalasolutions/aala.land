import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { isTransferAdmin } from 'land/utils/feature-gate';

export default class ImportContactsRoute extends AuthenticatedRoute {
  @service session;
  @service router;

  beforeModel(transition) {
    super.beforeModel(transition);
    if (this.session.isAuthenticated && !isTransferAdmin(this.session)) {
      this.router.transitionTo('contacts.index');
    }
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.reset();
  }
}
