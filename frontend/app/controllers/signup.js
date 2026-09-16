import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';

/** Registers ?ref=; Ember only honors query params declared on the controller. */
export default class SignupController extends Controller {
  queryParams = ['ref'];

  @tracked ref = null;
}
