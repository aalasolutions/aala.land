import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import { isDestroyed } from '@ember/destroyable';

const PLACEMENTS = ['start', 'end', 'top', 'bottom'];
const SIZES = ['sm', 'md', 'lg'];

export default class NuDrawerComponent extends Component {
  titleId = `nu-drawer-title-${guidFor(this)}`;

  @tracked isMounted = false;
  @tracked isVisible = false;

  constructor() {
    super(...arguments);
    this.isMounted = Boolean(this.args.open);
    this.isVisible = Boolean(this.args.open);
  }

  get backdropClasses() {
    return this.isVisible
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
    if (this.isVisible) {
      parts.push('is-open');
    }
    return parts.join(' ');
  }

  get closeOnBackdrop() {
    return this.args.closeOnBackdrop !== false;
  }

  // Mounted while open or still animating out; visible drives the open classes.
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

  @action
  onClose() {
    this.args.onClose?.();
  }
}
