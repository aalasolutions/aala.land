import Component from '@glimmer/component';

// compact has no CSS kit equivalent.
export default class WovenDescListComponent extends Component {
  get classes() {
    return this.args.horizontal ? 'wu-desc-list horizontal' : 'wu-desc-list';
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
