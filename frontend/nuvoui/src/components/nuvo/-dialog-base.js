import Component from '@glimmer/component';
import { action } from '@ember/object';

// Backdrop close behaviour shared by Nuvo::Modal and Nuvo::Drawer.
export default class NuDialogBaseComponent extends Component {
  get closeOnBackdrop() {
    return this.args.closeOnBackdrop !== false;
  }

  @action
  onClose() {
    this.args.onClose?.();
  }
}
