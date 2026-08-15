import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

// Owners is retired as its own page. Contacts (filtered to the Owner tab) is
// the one hub now; this route only exists so old /owners links still land
// somewhere real. The controller/template pair under app/controllers/owners
// and app/templates/owners is dead code left in place (never rm/mv without
// Aamir's say-so) - beforeModel transitions away before either ever renders.
export default class OwnersIndexRoute extends AuthenticatedRoute {
  @service router;

  beforeModel() {
    this.router.transitionTo('contacts.index', { queryParams: { tag: 'owner' } });
  }
}
