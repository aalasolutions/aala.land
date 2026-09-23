import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { fuzzyFilter } from '../utils/fuzzy-match';

// URL transport for Nuvo::Autocomplete: the kit owns the UI, the app owns fetching.
// @listUrl preloads the whole list and filters it locally; @searchUrl queries per keystroke.
export default class RemoteAutocompleteComponent extends Component {
  @service auth;

  @tracked listItems = null;
  @tracked listFailed = false;
  listUrl = null;

  filter = fuzzyFilter;

  loadList = modifier((element, [url]) => {
    this.fetchList(url);
  });

  async fetchList(url) {
    this.listUrl = url;
    if (!url) {
      this.listItems = null;
      return;
    }
    try {
      const result = await this.auth.fetchJson(url);
      if (this.listUrl !== url) return;
      const payload = result?.data ?? result ?? [];
      this.listItems = Array.isArray(payload) ? payload : [];
      this.listFailed = false;
    } catch {
      if (this.listUrl === url) this.listFailed = true;
    }
  }

  get options() {
    if (!this.args.listUrl || this.listFailed) return undefined;
    return this.listItems ?? [];
  }

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
    const created = result.data ?? result;
    if (
      created &&
      this.listItems &&
      !this.listItems.some((i) => i.id === created.id)
    ) {
      this.listItems = [...this.listItems, created];
    }
    return created;
  }
}
