import Component from '@glimmer/component';

export default class NuPanelComponent extends Component {
  get classes() {
    const parts = ['nu-panel'];
    if (this.args.compact) {
      parts.push('m-compact');
    }
    if (this.args.raised) {
      parts.push('m-raised');
    }
    if (this.args.interactive) {
      parts.push('m-interactive');
    }
    return parts.join(' ');
  }

  get showHeader() {
    return Boolean(this.args.title);
  }
}
