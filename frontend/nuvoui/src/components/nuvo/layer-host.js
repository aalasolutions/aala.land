import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';

// Mounted once in application.hbs, before Nuvo::TooltipHost so tooltips paint above menus.
export default class NuLayerHostComponent extends Component {
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
