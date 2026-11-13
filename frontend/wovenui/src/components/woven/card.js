import Component from '@glimmer/component';

// compact, flat, raised, interactive, accent and selected have no CSS kit equivalent and render nothing.
export default class WovenCardComponent extends Component {
  get showHeader() {
    return Boolean(this.args.title || this.args.subtitle);
  }
}
