import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import { registerDestructor, isDestroyed } from '@ember/destroyable';
import { runTask } from 'ember-lifeline';

const PLACEMENTS = ['start', 'end', 'top', 'bottom'];
const SIZES = ['sm', 'md', 'lg'];

export default class NuDrawerComponent extends Component {
  titleId = `nu-drawer-title-${guidFor(this)}`;

  // isMounted keeps the panel in the DOM while it slides out; isVisible drives
  // the is-open class one paint later so the transform actually transitions.
  @tracked isMounted = false;
  @tracked isVisible = false;

  keydownHandler = null;

  frameHandle = null;

  constructor() {
    super(...arguments);
    this.isMounted = Boolean(this.args.open);
    this.isVisible = Boolean(this.args.open);
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
      if (this.frameHandle !== null) {
        cancelAnimationFrame(this.frameHandle);
        this.frameHandle = null;
      }
    });
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

  @action
  syncOpen(element, [open]) {
    if (open) {
      this.isMounted = true;
      this.nextPaint(() => {
        this.isVisible = true;
      });
      return;
    }

    this.isVisible = false;
    runTask(
      this,
      () => {
        this.isMounted = false;
      },
      this.transitionMs(element),
    );
  }

  nextPaint(callback) {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = requestAnimationFrame(() => {
        this.frameHandle = null;
        if (isDestroyed(this)) {
          return;
        }
        callback();
      });
    });
  }

  transitionMs(element) {
    const duration = getComputedStyle(element).transitionDuration;
    return (parseFloat(duration) || 0) * 1000;
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
