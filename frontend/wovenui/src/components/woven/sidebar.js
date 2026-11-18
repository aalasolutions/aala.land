import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

// Must match the kit md breakpoint, where the topbar menu button appears.
const NARROW_QUERY = '(max-width: 767.98px)';

export default class WovenSidebarComponent extends Component {
  @tracked isNarrow = false;

  media = null;

  constructor() {
    super(...arguments);
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.media = window.matchMedia(NARROW_QUERY);
      this.isNarrow = this.media.matches;
      this.media.addEventListener('change', this.onMediaChange);
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.media?.removeEventListener('change', this.onMediaChange);
  }

  onMediaChange = (event) => {
    this.isNarrow = event.matches;
  };

  get asDrawer() {
    return Boolean(this.args.dismissible) && this.isNarrow;
  }

  @action
  dismiss() {
    this.args.onDismiss?.();
  }

  get classes() {
    const parts = ['wu-sidebar'];
    if (this.args.collapsed) {
      parts.push('collapsed');
    }
    if (this.args.pinned) {
      parts.push('pinned');
    }
    if (this.args.animated) {
      parts.push('animated');
    }
    return parts.join(' ');
  }
}
