import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';

function normalizeName(input) {
  return (input || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export default class LocationTypeaheadComponent extends Component {
  @service auth;

  @tracked query = '';
  @tracked results = [];
  @tracked isSearching = false;
  @tracked showDropdown = false;
  @tracked isCreating = false;
  @tracked dropdownPosition = null;
  @tracked isInModal = false;
  @tracked hasLoadedResults = false;

  _debounceTimer = null;
  _inputElement = null;
  _pendingSearches = 0;

  get placeholder() {
    return this.args.placeholder || 'Search...';
  }

  get displayValue() {
    return this.args.selectedName || this.query;
  }

  get trimmedQuery() {
    return this.query.trim();
  }

  get uniqueResults() {
    let seenNames = new Set();

    return (this.results || []).filter((item) => {
      let normalizedName = normalizeName(item?.name);

      if (!normalizedName || seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    });
  }

  get hasExactMatch() {
    let normalizedQuery = normalizeName(this.trimmedQuery);

    if (!normalizedQuery) {
      return false;
    }

    if (normalizeName(this.args.selectedName) === normalizedQuery) {
      return true;
    }

    return this.uniqueResults.some((item) => normalizeName(item.name) === normalizedQuery);
  }

  get canCreate() {
    return Boolean(
      this.args.createUrl &&
        this.trimmedQuery.length >= 2 &&
        this.query === this.trimmedQuery &&
        !this.isSearching &&
        this.hasLoadedResults &&
        !this.hasExactMatch
    );
  }

  get dropdownStyle() {
    if (!this.isInModal || !this.dropdownPosition) {
      return undefined;
    }

    let { top, left, width, maxHeight } = this.dropdownPosition;
    return htmlSafe(
      `position:fixed;top:${top}px;left:${left}px;width:${width}px;max-height:${maxHeight}px;z-index:2000;`
    );
  }

  hideDropdown() {
    this.showDropdown = false;
    this.dropdownPosition = null;
    this.isInModal = false;
  }

  updateDropdownPosition(inputElement = this._inputElement) {
    if (!inputElement || typeof window === 'undefined') {
      return;
    }

    let triggerRect = inputElement.getBoundingClientRect();
    let modalPanel = inputElement.closest('.modal-panel');
    let viewportPadding = 12;
    let dropdownGap = 6;
    let dropdownHeight = 260;
    let spaceBelow = window.innerHeight - triggerRect.bottom;
    let spaceAbove = triggerRect.top;
    let openUpward = !!modalPanel && spaceBelow < 170 && spaceAbove > spaceBelow;
    let top = openUpward
      ? Math.max(viewportPadding, triggerRect.top - Math.min(dropdownHeight, spaceAbove - viewportPadding))
      : Math.min(triggerRect.bottom + dropdownGap, window.innerHeight - viewportPadding);

    this.isInModal = !!modalPanel;
    this.dropdownPosition = {
      top,
      left: Math.max(viewportPadding, Math.min(triggerRect.left, window.innerWidth - triggerRect.width - viewportPadding)),
      width: Math.min(triggerRect.width, window.innerWidth - viewportPadding * 2),
      maxHeight: openUpward ? Math.max(120, triggerRect.top - viewportPadding - dropdownGap) : Math.max(120, spaceBelow - viewportPadding),
    };
  }

  @action
  onInput(event) {
    this._inputElement = event.target;
    this.query = event.target.value;
    this.hasLoadedResults = false;

    if (this.args.onClear && !this.query) {
      this.args.onClear();
    }

    clearTimeout(this._debounceTimer);

    if (this.query.length < 2) {
      this._pendingSearches = 0;
      this.isSearching = false;
      this.results = [];
      this.hideDropdown();
      return;
    }

    this.results = [];
    this.hideDropdown();
    this._debounceTimer = setTimeout(() => this.search(), 300);
  }

  @action
  onFocus(event) {
    this._inputElement = event.target;

    if (this.uniqueResults.length > 0 || this.canCreate) {
      this.updateDropdownPosition(event.target);
      this.showDropdown = true;
    }
  }

  @action
  onBlur() {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      this.hideDropdown();
    }, 200);
  }

  async search() {
    if (!this.args.searchUrl) return;

    let query = this.trimmedQuery;

    this._pendingSearches += 1;
    this.isSearching = true;
    try {
      const separator = this.args.searchUrl.includes('?') ? '&' : '?';
      const url = `${this.args.searchUrl}${separator}q=${encodeURIComponent(query)}`;
      const result = await this.auth.fetchJson(url);
      if (query !== this.trimmedQuery) {
        return;
      }

      this.results = result.data || result || [];
      this.hasLoadedResults = true;
    } catch {
      if (query === this.trimmedQuery) {
        this.results = [];
      }
    } finally {
      this._pendingSearches = Math.max(0, this._pendingSearches - 1);
      this.isSearching = this._pendingSearches > 0;

      if (query !== this.trimmedQuery) {
        return;
      }

      if (this.uniqueResults.length > 0 || this.canCreate) {
        this.updateDropdownPosition();
        this.showDropdown = true;
      } else {
        this.hideDropdown();
      }
    }
  }

  @action
  selectItem(item) {
    this.query = item.name;
    this.results = [];
    this.hasLoadedResults = true;
    this.hideDropdown();

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
      this.results = [];
      this.hasLoadedResults = true;
      this.hideDropdown();

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
