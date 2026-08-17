import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

// owner_id IS a contact id (Owners always read straight through to Contacts).
// See app/routes/owners/index.js for why this route only redirects.
export default class OwnersDetailRoute extends AuthenticatedRoute {
  @service router;

  beforeModel(transition) {
    this.router.transitionTo('contacts.detail', transition.to.params.owner_id);
  }
}
