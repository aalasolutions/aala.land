import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

// Owners page retired in favor of Contacts' Owner tab; route kept so old /owners links land.
export default class OwnersIndexRoute extends AuthenticatedRoute {
  @service router;

  beforeModel() {
    this.router.transitionTo('contacts.index', { queryParams: { tag: 'owner' } });
  }
}
