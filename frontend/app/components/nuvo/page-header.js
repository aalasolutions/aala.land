import Component from '@glimmer/component';

export default class NuPageHeaderComponent extends Component {
  get classes() {
    const parts = ['nu-page-header'];

    if (this.args.bordered) {
      parts.push('m-bordered');
    }
    if (this.args.sticky) {
      parts.push('m-sticky');
    }

    return parts.join(' ');
  }
}
