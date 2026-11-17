import Component from '@glimmer/component';

// The kit has sm only (lg renders the default) and no fill modifier; bordered maps to dashed.
export default class WovenEmptyStateComponent extends Component {
  get classes() {
    const parts = ['wu-empty-state'];

    if (this.args.size === 'sm' || this.args.size === 'xs') {
      parts.push('sm');
    }
    if (this.args.bordered) {
      parts.push('dashed');
    }

    return parts.join(' ');
  }
}
