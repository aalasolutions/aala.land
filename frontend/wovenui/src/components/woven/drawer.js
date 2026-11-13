import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import { isDestroyed, registerDestructor } from '@ember/destroyable';
import { next } from '@ember/runloop';
import WovenDialogBaseComponent from './-dialog-base';

// Kit docks: inline end (default), inline start, bottom; top maps to bottom.
const PLACEMENT_CLASS = { start: 'inline-start', bottom: 'bottom', top: 'bottom' };
// No @size means the wide kit drawer; md is the kit default width.
const SIZE_CLASS = { sm: 'sm', md: null, lg: 'lg' };

export default class WovenDrawerComponent extends WovenDialogBaseComponent {
  titleId = `wu-drawer-title-${guidFor(this)}`;

  @tracked isMounted = false;
  @tracked isVisible = false;

  dialogElement = null;

  constructor() {
    super(...arguments);
    this.isMounted = Boolean(this.args.open);
    this.isVisible = Boolean(this.args.open);
    // Torn down before the leave timer fires, so resolve the close here. Queued,
    // because the consumer's reset must not run inside the destroying render.
    registerDestructor(this, () => {
      if (!this.isMounted) return;
      const onClosed = this.args.onClosed;
      // ember-lifeline cannot schedule on an object being destroyed, so plain `next`.
      // eslint-disable-next-line ember/no-runloop
      if (onClosed) next(() => onClosed());
    });
  }

  get drawerClasses() {
    const parts = ['wu-drawer'];
    const placement = PLACEMENT_CLASS[this.args.placement];
    if (placement) {
      parts.push(placement);
    }
    const size = Object.hasOwn(SIZE_CLASS, this.args.size)
      ? SIZE_CLASS[this.args.size]
      : 'lg';
    if (size) {
      parts.push(size);
    }
    if (this.animated) {
      parts.push('animated');
    }
    return parts.join(' ');
  }

  @action
  registerDialog(element) {
    this.dialogElement = element;
  }

  @action
  getDialogElement() {
    return this.dialogElement;
  }

  // Mounted while open or still animating out; visible drives showModal() and close().
  @action
  onOpen() {
    if (isDestroyed(this)) return;
    this.isMounted = true;
  }

  @action
  onVisible() {
    if (isDestroyed(this)) return;
    this.isVisible = true;
  }

  @action
  onHide() {
    if (isDestroyed(this)) return;
    this.isVisible = false;
  }

  @action
  onHidden() {
    if (isDestroyed(this)) return;
    const wasMounted = this.isMounted;
    this.isMounted = false;
    // Pages clear their form state here, so it does not flash during the slide out.
    if (wasMounted) this.args.onClosed?.();
  }
}
