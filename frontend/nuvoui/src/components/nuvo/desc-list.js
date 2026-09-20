import Component from '@glimmer/component';

export default class NuDescListComponent extends Component {
  get classes() {
    const parts = ['nu-desc-list'];

    if (this.args.horizontal) {
      parts.push('m-horizontal');
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
    return items.map((entry, index) => ({
      key: index,
      term: entry.term,
      description: entry.description,
    }));
  }
}
