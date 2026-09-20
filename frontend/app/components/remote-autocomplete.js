import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';

// URL transport for Nuvo::Autocomplete: the kit owns the UI, the app owns fetching.
export default class RemoteAutocompleteComponent extends Component {
  @service auth;

  get searchParam() {
    return this.args.searchParam ?? 'q';
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
    return Array.isArray(payload) ? payload : (payload.data ?? []);
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
    return result.data ?? result;
  }
}
