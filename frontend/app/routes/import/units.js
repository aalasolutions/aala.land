import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { isTransferAdmin } from 'land/utils/feature-gate';

export default class ImportUnitsRoute extends AuthenticatedRoute {
  @service session;
  @service router;

  beforeModel(transition) {
    super.beforeModel(transition);
    if (transition.isAborted) return;
    if (!isTransferAdmin(this.session)) {
      this.router.transitionTo('properties.index');
    }
  }
}
