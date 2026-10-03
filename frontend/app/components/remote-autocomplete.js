import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { fuzzyFilter } from '../utils/fuzzy-match';

// Paginated endpoints wrap the array once more; mapItem lets the host shape each fetched item.
export function toItems(payload, mapItem) {
  const list = Array.isArray(payload) ? payload : payload?.data;
  const items = Array.isArray(list) ? list : [];
  return mapItem ? items.map((item) => mapItem(item)) : items;
}

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
      this.listItems = toItems(result?.data ?? result, this.args.mapItem);
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

  get allowCreate() {
    return (
      typeof this.args.onCreate === 'function' || Boolean(this.args.createUrl)
    );
  }

  @action
  async search(term) {
    if (!this.args.searchUrl) {
      return [];
    }
    const separator = this.args.searchUrl.includes('?') ? '&' : '?';
    const url = `${this.args.searchUrl}${separator}${this.searchParam}=${encodeURIComponent(term)}`;
    const result = await this.auth.fetchJson(url);
    return toItems(result?.data ?? result, this.args.mapItem);
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
    const raw = result.data ?? result;
    const created = raw ? toItems([raw], this.args.mapItem)[0] : raw;
    if (
      created &&
      this.listItems &&
      !this.listItems.some((i) => i.id === created.id)
    ) {
      this.listItems = [...this.listItems, created];
    }
    return created;
  }

  // A host @onCreate replaces the createUrl POST.
  @action
  onCreate(term) {
    if (typeof this.args.onCreate === 'function') {
      return this.args.onCreate(term);
    }
    return this.create(term);
  }
}
