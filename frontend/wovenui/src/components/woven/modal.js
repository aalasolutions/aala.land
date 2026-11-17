import { guidFor } from '@ember/object/internals';
import WovenDialogBaseComponent from './-dialog-base';

// md is the kit default width; xl folds into lg, the widest kit size.
const SIZE_CLASS = { sm: 'sm', lg: 'lg', xl: 'lg', full: 'full' };

export default class WovenModalComponent extends WovenDialogBaseComponent {
  titleId = `wu-modal-title-${guidFor(this)}`;

  get showClose() {
    return this.args.showClose !== false;
  }

  get modalClasses() {
    const parts = ['wu-modal'];
    const size = SIZE_CLASS[this.args.size];
    if (size) {
      parts.push(size);
    }
    if (this.animated) {
      parts.push('animated');
    }
    return parts.join(' ');
  }
}
