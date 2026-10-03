import AuthenticatedRoute from './authenticated';

// Documents::Panel loads the list from the controller's query params; the route fetches nothing.
export default class DocumentsRoute extends AuthenticatedRoute {
  resetController(controller, isExiting) {
    if (isExiting) controller.resetState();
  }
}
