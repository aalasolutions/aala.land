import Component from '@glimmer/component';
import { action } from '@ember/object';

// Close and motion args shared by Woven::Modal, Woven::ConfirmModal and Woven::Drawer.
export default class WovenDialogBaseComponent extends Component {
  get closeOnBackdrop() {
    return this.args.closeOnBackdrop !== false;
  }

  get animated() {
    return this.args.animated !== false;
  }

  @action
  onClose() {
    this.args.onClose?.();
  }
}
