import Component from '@glimmer/component';

export default class WovenToolbarComponent extends Component {
  get classes() {
    const parts = ['wu-toolbar'];
    if (this.args.bordered) {
      parts.push('boxed');
    }
    if (this.args.size === 'sm') {
      parts.push('sm');
    }
    return parts.join(' ');
  }
}
