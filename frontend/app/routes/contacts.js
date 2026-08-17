import AuthenticatedRoute from './authenticated';

// Parent-route shell only. Real logic lives in routes/contacts/index.js and
// routes/contacts/detail.js - kept as an empty pass-through (not deleted) so
// the resolver doesn't hit a stale model()/queryParams config that shadows
// the children.
export default class ContactsRoute extends AuthenticatedRoute {}
