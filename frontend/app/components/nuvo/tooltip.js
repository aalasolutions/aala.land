import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';

const PLACEMENTS = ['top', 'bottom', 'start', 'end'];

export default class NuTooltipComponent extends Component {
  @tracked isVisible = false;

  contentId = `nu-tooltip-content-${guidFor(this)}`;

  get classes() {
    const parts = ['nu-tooltip'];
    if (PLACEMENTS.includes(this.args.placement)) {
      parts.push(`m-${this.args.placement}`);
    } else {
      parts.push('m-top');
    }
    if (this.args.light) {
      parts.push('m-light');
    }
    if (this.isVisible) {
      parts.push('is-visible');
    }
    return parts.join(' ');
  }

  @action
  show() {
    if (this.args.disabled) {
      return;
    }
    this.isVisible = true;
  }

  @action
  hide() {
    this.isVisible = false;
  }

  @action
  onKeydown(event) {
    if (event.key === 'Escape') {
      this.hide();
    }
  }
}
