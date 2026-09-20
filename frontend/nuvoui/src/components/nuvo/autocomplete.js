import Component from '@glimmer/component';
import { action } from '@ember/object';

// @onSearch(term) and @onCreate(term) return domain objects; the host owns transport.
export default class NuAutocompleteComponent extends Component {
  get allowCreate() {
    return Boolean(this.args.onCreate);
  }

  get labelKey() {
    return this.args.labelKey ?? 'name';
  }

  toOption(item) {
    return { value: item.id, label: item[this.labelKey], item };
  }

  @action
  async search(term) {
    const items = (await this.args.onSearch?.(term)) ?? [];
    return items.map((item) => this.toOption(item));
  }

  @action
  async create(term) {
    const item = await this.args.onCreate?.(term);
    return item ? this.toOption(item) : null;
  }

  @action
  onSelect(value, option) {
    this.args.onSelect?.(option.item ?? option);
  }
}
