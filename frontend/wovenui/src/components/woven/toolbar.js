import Component from '@glimmer/component';

export default class NuToolbarComponent extends Component {
  get classes() {
    const parts = ['wu-toolbar'];
    if (this.args.sticky) {
      parts.push('m-sticky');
    }
    if (this.args.bordered) {
      parts.push('m-bordered');
    }
    return parts.join(' ');
  }
}
