import Controller from '@ember/controller';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class OwnersDetailController extends Controller {
  @service router;

  @action goBack() {
    this.router.transitionTo('owners');
  }

  @action editOwner() {
    this.router.transitionTo('owners');
  }
}
