import Component from '@glimmer/component';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];

export default class NuCardComponent extends Component {
  get classes() {
    const parts = ['nu-card'];
    if (this.args.flush) {
      parts.push('m-flush');
    }
    if (this.args.compact) {
      parts.push('m-compact');
    }
    if (this.args.flat) {
      parts.push('m-flat');
    }
    if (this.args.raised) {
      parts.push('m-raised');
    }
    if (this.args.interactive) {
      parts.push('m-interactive');
    }
    if (this.args.accent && VARIANTS.includes(this.args.accent)) {
      parts.push('m-accent', `m-${this.args.accent}`);
    }
    if (this.args.selected) {
      parts.push('is-selected');
    }
    return parts.join(' ');
  }

  get showHeader() {
    return Boolean(this.args.title || this.args.subtitle);
  }
}
