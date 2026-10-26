import Component from '@glimmer/component';
import { action } from '@ember/object';

// Backdrop close behaviour shared by Woven::Modal and Woven::Drawer.
export default class NuDialogBaseComponent extends Component {
  get closeOnBackdrop() {
    return this.args.closeOnBackdrop !== false;
  }

  @action
  onClose() {
    this.args.onClose?.();
  }
}
