import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class NuAutocompleteComponent extends Component {
  @service auth;

  get allowCreate() {
    return Boolean(this.args.createUrl);
  }

  toOption(item) {
    return { value: item.id, label: item.name, item };
  }

  @action
  async search(term) {
    if (!this.args.searchUrl) {
      return [];
    }
    const separator = this.args.searchUrl.includes('?') ? '&' : '?';
    const url = `${this.args.searchUrl}${separator}q=${encodeURIComponent(term)}`;
    const result = await this.auth.fetchJson(url);
    const items = result.data ?? result ?? [];
    return items.map((item) => this.toOption(item));
  }

  @action
  async create(term) {
    if (!this.args.createUrl) {
      return null;
    }
    const result = await this.auth.fetchJson(this.args.createUrl, {
      method: 'POST',
      body: JSON.stringify({ name: term, ...this.args.createPayload }),
    });
    return this.toOption(result.data ?? result);
  }

  @action
  onSelect(value, option) {
    this.args.onSelect?.(option.item ?? option);
  }
}
