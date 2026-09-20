import Component from '@glimmer/component';

export default class NuInputGroupComponent extends Component {
  get hasPrepend() {
    return Boolean(this.args.prepend);
  }

  get hasAppend() {
    return Boolean(this.args.append);
  }
}
