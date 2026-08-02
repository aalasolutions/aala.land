import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { registerDestructor } from '@ember/destroyable';

const PLACEMENTS = ['top', 'bottom', 'start', 'end'];

export default class NuPopoverComponent extends Component {
  @tracked internalOpen = false;

  titleId = `nu-popover-title-${guidFor(this)}`;

  rootElement = null;
  clickOutsideHandler = null;

  // Controlled when @open is passed, uncontrolled otherwise - same pattern as nu-dropdown.
  get isOpen() {
    return this.args.open !== undefined ? this.args.open : this.internalOpen;
  }

  constructor() {
    super(...arguments);
    this.clickOutsideHandler = (event) => {
      if (
        this.isOpen &&
        this.rootElement &&
        !this.rootElement.contains(event.target)
      ) {
        this.close();
      }
    };
    document.addEventListener('click', this.clickOutsideHandler, true);
    registerDestructor(this, () => {
      document.removeEventListener('click', this.clickOutsideHandler, true);
      this.clickOutsideHandler = null;
    });
  }

  get classes() {
    const parts = ['nu-popover'];
    if (PLACEMENTS.includes(this.args.placement)) {
      parts.push(`m-${this.args.placement}`);
    } else {
      parts.push('m-bottom');
    }
    if (this.isOpen) {
      parts.push('is-visible');
    }
    return parts.join(' ');
  }

  @action
  registerRoot(element) {
    this.rootElement = element;
  }

  // In controlled mode the caller owns the state, so opening is reported via
  // @onToggle rather than silently mutating internalOpen (which would be ignored).
  @action
  toggle() {
    if (this.isOpen) {
      this.close();
      return;
    }
    if (this.args.open !== undefined) {
      this.args.onToggle?.(true);
      return;
    }
    this.internalOpen = true;
  }

  @action
  close() {
    this.internalOpen = false;
    this.args.onClose?.();
  }

  @action
  onKeydown(event) {
    if (event.key === 'Escape' && this.isOpen) {
      this.close();
    }
  }
}
