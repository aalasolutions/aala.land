import Component from '@glimmer/component';

export default class WovenPageHeaderComponent extends Component {
  get classes() {
    return this.args.bordered ? 'wu-page-header divided' : 'wu-page-header';
  }
}
