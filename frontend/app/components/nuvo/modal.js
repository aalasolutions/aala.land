import Component from '@glimmer/component';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { registerDestructor } from '@ember/destroyable';
import { runTask } from 'ember-lifeline';

const SIZES = ['sm', 'md', 'lg', 'xl', 'full'];

export default class NuModalComponent extends Component {
  titleId = `nu-modal-title-${guidFor(this)}`;

  keydownHandler = null;

  constructor() {
    super(...arguments);
    this.keydownHandler = (event) => {
      if (!this.args.open) {
        return;
      }
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

  @action
  registerModal(element) {
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
