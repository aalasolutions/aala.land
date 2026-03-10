import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class ToastContainerComponent extends Component {
  @service notifications;

  @action
  dismiss(id) {
    this.notifications.remove(id);
  }
}
