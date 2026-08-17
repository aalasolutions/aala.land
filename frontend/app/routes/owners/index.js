import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

// Owners is retired as its own page. Contacts (filtered to the Owner tab) is
// the one hub now; this route only exists so old /owners links still land
export default class OwnersIndexRoute extends AuthenticatedRoute {
  @service router;

  beforeModel() {
    this.router.transitionTo('contacts.index', { queryParams: { tag: 'owner' } });
  }
}
