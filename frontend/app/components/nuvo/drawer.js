import Component from '@glimmer/component';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { registerDestructor } from '@ember/destroyable';
import { runTask } from 'ember-lifeline';

const PLACEMENTS = ['start', 'end', 'top', 'bottom'];
const SIZES = ['sm', 'md', 'lg'];

export default class NuDrawerComponent extends Component {
  titleId = `nu-drawer-title-${guidFor(this)}`;

  keydownHandler = null;

  constructor() {
    super(...arguments);
    this.keydownHandler = (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (this.args.closeOnEsc === false) {
        return;
      }
      this.args.onClose?.();
    };
    registerDestructor(this, () => {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    });
  }

  get backdropClasses() {
    return this.args.open
      ? 'nu-drawer-backdrop is-open'
      : 'nu-drawer-backdrop';
  }

  get drawerClasses() {
    const parts = ['nu-drawer'];
    if (PLACEMENTS.includes(this.args.placement)) {
      parts.push(`m-${this.args.placement}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.open) {
      parts.push('is-open');
    }
    return parts.join(' ');
  }

  @action
  registerDrawer(element) {
    document.addEventListener('keydown', this.keydownHandler);
    runTask(
      this,
      () => {
        const target =
          element.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ) || element;
        target.focus();
      },
      0,
    );
  }

  @action
  onBackdropClick(event) {
    if (this.args.closeOnBackdrop === false) {
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }
    this.args.onClose?.();
  }

  @action
  onClose() {
    this.args.onClose?.();
  }
}
