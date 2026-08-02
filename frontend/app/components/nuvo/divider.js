import Component from '@glimmer/component';

export default class NuDividerComponent extends Component {
  get classes() {
    const parts = ['nu-divider'];

    if (this.args.vertical) {
      parts.push('m-vertical');
    }
    if (this.args.dashed) {
      parts.push('m-dashed');
    }
    if (this.args.labelPosition === 'start') {
      parts.push('m-start');
    }
    if (this.args.labelPosition === 'end') {
      parts.push('m-end');
    }

    return parts.join(' ');
  }
}
