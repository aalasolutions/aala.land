import Component from '@glimmer/component';
import { service } from '@ember/service';

export default class WovenDialogHostComponent extends Component {
  @service dialogs;
}
