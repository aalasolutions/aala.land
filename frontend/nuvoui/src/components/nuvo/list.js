import Component from '@glimmer/component';

export default class NuListComponent extends Component {
  get classes() {
    const parts = ['nu-list'];

    if (this.args.plain) {
      parts.push('m-plain');
    }
    if (this.args.ordered) {
      parts.push('m-ordered');
    }
    if (this.args.inline) {
      parts.push('m-inline');
    }
    if (this.args.bordered) {
      parts.push('m-bordered');
    }
    if (this.args.compact) {
      parts.push('m-compact');
    }

    return parts.join(' ');
  }

  get normalizedItems() {
    const items = this.args.items;
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map((entry, index) => {
      if (typeof entry === 'string') {
        return { key: index, label: entry, icon: null };
      }
      return { key: index, label: entry.label, icon: entry.icon || null };
    });
  }
}
