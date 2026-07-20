import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';

/**
 * Registers the ?ref= marketer/referral query param (first-touch attribution,
 * requirements capability 5). Ember only honors query params declared on a
 * CONTROLLER; a route-level hash alone is dead code (known repo gotcha).
 */
export default class SignupController extends Controller {
  queryParams = ['ref'];

  @tracked ref = null;
}
