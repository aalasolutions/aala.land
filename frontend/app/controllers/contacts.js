import Controller from '@ember/controller';

// Parent-route shell only. Real logic lives in controllers/contacts/index.js
// and controllers/contacts/detail.js - kept as an empty pass-through (not
// deleted) so a stale queryParams/tracked-state config doesn't shadow the
// children's.
export default class ContactsController extends Controller {}
