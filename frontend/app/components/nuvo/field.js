import Component from '@glimmer/component';

export default class NuFieldComponent extends Component {
  get classes() {
    const parts = ['nu-field'];
    if (this.args.horizontal) {
      parts.push('m-horizontal');
    }
    if (this.args.flush) {
      parts.push('m-flush');
    }
    return parts.join(' ');
  }

  get showError() {
    return Boolean(this.args.error);
  }

  get showHint() {
    return Boolean(this.args.hint) && !this.showError;
  }
}
