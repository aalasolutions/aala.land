import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class NuAutocompleteComponent extends Component {
  @service auth;

  get allowCreate() {
    return Boolean(this.args.createUrl);
  }

  get labelKey() {
    return this.args.labelKey ?? 'name';
  }

  get searchParam() {
    return this.args.searchParam ?? 'q';
  }

  toOption(item) {
    return { value: item.id, label: item[this.labelKey], item };
  }

  @action
  async search(term) {
    if (!this.args.searchUrl) {
      return [];
    }
    const separator = this.args.searchUrl.includes('?') ? '&' : '?';
    const url = `${this.args.searchUrl}${separator}${this.searchParam}=${encodeURIComponent(term)}`;
    const result = await this.auth.fetchJson(url);
    const payload = result.data ?? result ?? [];
    // Search endpoints return a bare array; paginated ones wrap it again.
    const items = Array.isArray(payload) ? payload : (payload.data ?? []);
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
