import Component from '@glimmer/component';
import { VARIANTS } from './-constants';

// active sets aria-current="step"; complete has no kit equivalent, earlier items fill on their own.
export default class WovenTimelineItemComponent extends Component {
  get classes() {
    return VARIANTS.includes(this.args.variant)
      ? `wu-timeline-item ${this.args.variant}`
      : 'wu-timeline-item';
  }
}
