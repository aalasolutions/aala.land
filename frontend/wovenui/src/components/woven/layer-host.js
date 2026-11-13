import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';

// Mounted once in application.hbs: the body-level layer for overlays outside any open dialog.
export default class WovenLayerHostComponent extends Component {
  @service layer;

  @action
  register(element) {
    this.layer.register(element);
  }

  @action
  unregister(element) {
    this.layer.unregister(element);
  }
}
