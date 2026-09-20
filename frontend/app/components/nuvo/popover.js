import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { registerDestructor } from '@ember/destroyable';
import { service } from '@ember/service';

const PLACEMENTS = ['top', 'bottom', 'start', 'end'];
const TRIGGER_FOCUSABLE = 'input, button, [tabindex]';

export default class NuPopoverComponent extends Component {
  @service layer;

  @tracked internalOpen = false;

  titleId = `nu-popover-title-${guidFor(this)}`;

  rootElement = null;
  panelElement = null;
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
        !this.rootElement.contains(event.target) &&
        !this.panelElement?.contains(event.target)
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

  get placement() {
    return PLACEMENTS.includes(this.args.placement)
      ? this.args.placement
      : 'bottom';
  }

  get anchorPlacement() {
    return this.placement;
  }

  get anchorAlign() {
    return this.args.align === 'end' ? 'end' : 'center';
  }

  get classes() {
    const parts = ['nu-popover', `m-${this.placement}`];
    if (this.args.align === 'end') {
      parts.push('m-align-end');
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

  @action
  registerPanel(element) {
    this.panelElement = element;
  }

  @action
  forgetPanel() {
    this.panelElement = null;
  }

  // Controlled mode: caller owns state, so report via @onToggle, not internalOpen.
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
    const active = document.activeElement;
    if (active && this.panelElement?.contains(active)) {
      this.rootElement?.querySelector(TRIGGER_FOCUSABLE)?.focus();
    }
    this.internalOpen = false;
    this.args.onClose?.();
  }

  @action
  onKeydown(event) {
    if (event.key === 'Escape' && this.isOpen) {
      event.stopPropagation();
      this.close();
    }
  }
}
