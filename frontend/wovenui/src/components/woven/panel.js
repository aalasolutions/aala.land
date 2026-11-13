import Component from '@glimmer/component';

// compact, raised and interactive have no CSS kit equivalent and render nothing.
export default class WovenPanelComponent extends Component {
  get showHeader() {
    return Boolean(this.args.title);
  }
}
