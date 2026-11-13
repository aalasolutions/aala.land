import Component from '@glimmer/component';

// plain, inline and bordered have no CSS kit equivalent; ordered only picks the ol element.
export default class WovenListComponent extends Component {
  get classes() {
    return this.args.compact ? 'wu-list sm' : 'wu-list';
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
