import { guidFor } from '@ember/object/internals';
import NuDialogBaseComponent from 'land/components/nuvo/-dialog-base';

const SIZES = ['sm', 'md', 'lg', 'xl', 'full'];

export default class NuModalComponent extends NuDialogBaseComponent {
  titleId = `nu-modal-title-${guidFor(this)}`;

  get showClose() {
    return this.args.showClose !== false;
  }

  get backdropClasses() {
    const parts = ['nu-backdrop'];
    if (this.args.blur) {
      parts.push('m-blur');
    }
    if (this.args.top) {
      parts.push('m-top');
    }
    if (this.args.open) {
      parts.push('is-open');
    }
    return parts.join(' ');
  }

  get modalClasses() {
    const parts = ['nu-modal'];
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.scrollable) {
      parts.push('is-scrollable');
    }
    if (this.args.open) {
      parts.push('is-open');
    }
    return parts.join(' ');
  }
}
