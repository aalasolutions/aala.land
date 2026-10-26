import Component from '@glimmer/component';

const SIZES = ['xs', 'sm', 'lg'];

// @size scales the addons; pass the same @size to the input inside.
export default class NuInputGroupComponent extends Component {
  get classes() {
    const parts = ['wu-input-group'];
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    return parts.join(' ');
  }

  get hasPrepend() {
    return Boolean(this.args.prepend);
  }

  get hasAppend() {
    return Boolean(this.args.append);
  }
}
