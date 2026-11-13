import Component from '@glimmer/component';

// The CSS kit input group has no sizes: size the inner controls, and the addons stretch to the row.
export default class WovenInputGroupComponent extends Component {
  get hasPrepend() {
    return Boolean(this.args.prepend);
  }

  get hasAppend() {
    return Boolean(this.args.append);
  }
}
