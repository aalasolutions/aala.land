import Component from '@glimmer/component';

const SIZES = ['sm', 'lg'];

export default class NuEmptyStateComponent extends Component {
  get classes() {
    const parts = ['nu-empty-state'];

    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.bordered) {
      parts.push('m-bordered');
    }

    return parts.join(' ');
  }
}
