import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { registerDestructor } from '@ember/destroyable';
import { service } from '@ember/service';

const PLACEMENTS = ['top', 'bottom', 'start', 'end'];
const TRIGGER_FOCUSABLE = 'input, button, [tabindex]';

export default class WovenPopoverComponent extends Component {
  @service layer;

  @tracked internalOpen = false;

  titleId = `wu-popover-title-${guidFor(this)}`;

  rootElement = null;
  panelElement = null;
  clickOutsideHandler = null;

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

  get layerElement() {
    return this.layer.elementFor(this.rootElement);
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

  @action
  registerRoot(element) {
    this.rootElement = element;
  }

  @action
  registerPanel(element) {
    this.panelElement = element;
    // Shown before the anchor measures it; kit open styles key on :popover-open.
    element.showPopover?.();
  }

  @action
  forgetPanel(element) {
    if (this.panelElement === element) {
      this.panelElement = null;
    }
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
      // Cancelled too, so an open dialog underneath gets no close request.
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }
}
