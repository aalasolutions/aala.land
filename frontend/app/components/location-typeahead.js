import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class LocationTypeaheadComponent extends Component {
  @service auth;

  @tracked query = '';
  @tracked results = [];
  @tracked isSearching = false;
  @tracked showDropdown = false;
  @tracked isCreating = false;

  _debounceTimer = null;

  get placeholder() {
    return this.args.placeholder || 'Search...';
  }

  get displayValue() {
    return this.args.selectedName || this.query;
  }

  get trimmedQuery() {
    return this.query.trim();
  }

  get canCreate() {
    return Boolean(this.args.createUrl && this.trimmedQuery.length >= 2);
  }

  @action
  onInput(event) {
    this.query = event.target.value;

    if (this.args.onClear && !this.query) {
      this.args.onClear();
    }

    clearTimeout(this._debounceTimer);

    if (this.query.length < 2) {
      this.results = [];
      this.showDropdown = false;
      return;
    }

    this._debounceTimer = setTimeout(() => this.search(), 300);
  }

  @action
  onFocus() {
    if (this.results.length > 0) {
      this.showDropdown = true;
    }
  }

  @action
  onBlur() {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      this.showDropdown = false;
    }, 200);
  }

  async search() {
    if (!this.args.searchUrl) return;

    this.isSearching = true;
    try {
      const separator = this.args.searchUrl.includes('?') ? '&' : '?';
      const url = `${this.args.searchUrl}${separator}q=${encodeURIComponent(this.query)}`;
      const result = await this.auth.fetchJson(url);
      this.results = result.data || result || [];
      this.showDropdown = this.results.length > 0 || this.query.length >= 2;
    } catch {
      this.results = [];
    } finally {
      this.isSearching = false;
    }
  }

  @action
  selectItem(item) {
    this.query = item.name;
    this.showDropdown = false;
    this.results = [];

    if (this.args.onSelect) {
      this.args.onSelect(item);
    }
  }

  @action
  async createNew() {
    if (!this.args.createUrl || !this.query.trim() || this.isCreating) return;

    this.isCreating = true;
    try {
      const body = { name: this.query.trim(), ...this.args.createPayload };
      const result = await this.auth.fetchJson(this.args.createUrl, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const created = result.data || result;
      this.query = created.name;
      this.showDropdown = false;
      this.results = [];

      if (this.args.onSelect) {
        this.args.onSelect(created);
      }
    } catch (e) {
      console.error('Failed to create location:', e);
    } finally {
      this.isCreating = false;
    }
  }
}
