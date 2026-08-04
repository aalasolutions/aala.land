import PaginatedController from '../paginated-base';
import { action } from '@ember/object';
import { service } from '@ember/service';

// Owners are contacts who own at least one unit (the list is
// GET /contacts?tag=owner). Ownership is assigned on the unit page; a person's
// details are edited on the Contacts page. This page is a view of owner-contacts.
export default class OwnersIndexController extends PaginatedController {
  @service router;

  queryParams = ['page', 'limit'];

  @action viewOwner(owner) {
    this.router.transitionTo('owners.detail', owner.id);
  }
}
