import Component from '@glimmer/component';
import { VARIANTS } from './-constants';

// Title renders as h5. Place the timeline under an h4 to keep heading order.
export default class NuTimelineItemComponent extends Component {
  get classes() {
    const parts = ['nu-timeline__item'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (this.args.active) {
      parts.push('is-active');
    }
    if (this.args.complete) {
      parts.push('is-complete');
    }

    return parts.join(' ');
  }
}
