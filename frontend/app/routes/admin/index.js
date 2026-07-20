import Route from '@ember/routing/route';
import { service } from '@ember/service';

/** /admin lands on the scoreboard. */
export default class AdminIndexRoute extends Route {
  @service router;

  beforeModel() {
    this.router.transitionTo('admin.overview');
  }
}
