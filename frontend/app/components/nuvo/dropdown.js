import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { isDestroyed, registerDestructor } from '@ember/destroyable';
import { guidFor } from '@ember/object/internals';
import { cancelTask, runTask } from 'ember-lifeline';

const PLACEMENTS = ['start', 'end', 'up'];
const ALIGNMENTS = ['start', 'center', 'end'];

const CREATE_VALUE = '__nu_dropdown_create__';

export default class NuDropdownComponent extends Component {
  menuId = `nu-menu-${guidFor(this)}`;

  @tracked isOpen = false;
  @tracked searchText = '';
  @tracked highlightedIndex = -1;
  @tracked internalValue = undefined;
  @tracked remoteOptions = [];
  @tracked isSearching = false;
  @tracked isCreating = false;

  rootElement = null;
  clickOutsideHandler = null;
  searchTimer = null;
  searchSeq = 0;

  // Controlled when @value is passed, uncontrolled otherwise. Without this an
  // uncontrolled dropdown would never mark anything selected after a pick.
  get currentValue() {
    return this.args.value !== undefined ? this.args.value : this.internalValue;
  }

  constructor() {
    super(...arguments);
    this.clickOutsideHandler = (event) => {
      if (
        this.isOpen &&
        this.rootElement &&
        !this.rootElement.contains(event.target)
      ) {
        this.close();
      }
    };
    document.addEventListener('click', this.clickOutsideHandler, true);
    registerDestructor(this, () => {
      document.removeEventListener('click', this.clickOutsideHandler, true);
      this.clickOutsideHandler = null;
    });
  }

  get classes() {
    const parts = ['nu-dropdown'];
    if (PLACEMENTS.includes(this.args.placement)) {
      parts.push(`m-${this.args.placement}`);
    }
    if (ALIGNMENTS.includes(this.args.align)) {
      parts.push(`m-align-${this.args.align}`);
    }
    // Independent of the trigger: a [...] menu can centre its options while a
    // select-like dropdown keeps them at start.
    if (ALIGNMENTS.includes(this.args.optionsAlign)) {
      parts.push(`m-options-${this.args.optionsAlign}`);
    }
    if (this.isOpen) {
      parts.push('is-open');
    }
    return parts.join(' ');
  }

  get menuClasses() {
    return this.isOpen ? 'nu-menu is-open' : 'nu-menu';
  }

  get optionSource() {
    return this.args.remote ? this.remoteOptions : this.args.options || [];
  }

  // Accepts {value,label,group,icon,danger,disabled} objects or plain strings.
  @cached
  get normalizedOptions() {
    return this.optionSource.map((entry) => {
      const isObject = entry !== null && typeof entry === 'object';
      const value = isObject ? entry.value : entry;
      return {
        value,
        label: isObject ? (entry.label ?? value) : entry,
        group: isObject ? (entry.group ?? null) : null,
        icon: isObject ? (entry.icon ?? null) : null,
        danger: isObject ? Boolean(entry.danger) : false,
        disabled: isObject ? Boolean(entry.disabled) : false,
        // { separator: true } renders a divider instead of a clickable item.
        separator: isObject ? Boolean(entry.separator) : false,
        item: isObject ? (entry.item ?? entry) : entry,
      };
    });
  }

  // Separators are decoration: they must never be selectable or land under the
  // keyboard cursor, so they are excluded from the navigable list entirely.
  @cached
  get matchedOptions() {
    const term = this.searchText.trim().toLowerCase();
    const all = this.normalizedOptions.filter((o) => !o.separator);
    const matched =
      term && !this.args.remote
        ? all.filter(
            (o) =>
              String(o.label).toLowerCase().includes(term) ||
              String(o.group ?? '')
                .toLowerCase()
                .includes(term),
          )
        : all.slice();

    if (!matched.some((o) => o.group)) {
      return matched;
    }

    // Keep same-group entries contiguous so the flat keyboard index matches
    // the visual order. Preserves first-seen group order.
    const order = [];
    const byGroup = new Map();
    matched.forEach((o) => {
      const key = o.group || '';
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key).push(o);
    });
    return order.flatMap((key) => byGroup.get(key));
  }

  get minChars() {
    return this.args.minChars ?? 1;
  }

  get createRow() {
    if (!this.args.allowCreate) {
      return null;
    }
    const term = this.searchText.trim();
    if (term.length < this.minChars || this.isSearching) {
      return null;
    }
    const exists = this.normalizedOptions.some(
      (o) => String(o.label).trim().toLowerCase() === term.toLowerCase(),
    );
    if (exists) {
      return null;
    }
    return {
      value: CREATE_VALUE,
      label: this.isCreating ? 'Creating...' : `Add "${term}"`,
      group: null,
      icon: null,
      danger: false,
      disabled: this.isCreating,
      separator: false,
      isCreate: true,
    };
  }

  @cached
  get filteredOptions() {
    const row = this.createRow;
    return row ? [row, ...this.matchedOptions] : this.matchedOptions;
  }

  // Separators render only in the unfiltered, ungrouped list. Once a search
  // term or grouping reorders things, a fixed divider position is meaningless.
  @cached
  get flatRows() {
    if (this.args.remote || this.args.allowCreate || this.args.filterable) {
      return null;
    }
    if (this.searchText.trim() || this.normalizedOptions.some((o) => o.group)) {
      return null;
    }
    let index = -1;
    return this.normalizedOptions.map((option) => {
      if (option.separator) {
        return { separator: true };
      }
      index += 1;
      return {
        option,
        index,
        selected: option.value === this.currentValue,
        highlighted: index === this.highlightedIndex,
      };
    });
  }

  // Flat index is assigned here so keyboard nav and rendering agree.
  @cached
  get groupedOptions() {
    const groups = [];
    let current = null;
    this.filteredOptions.forEach((option, index) => {
      const name = option.group || null;
      if (!current || current.group !== name) {
        current = { group: name, rows: [] };
        groups.push(current);
      }
      current.rows.push({
        option,
        index,
        selected: option.value === this.currentValue,
        highlighted: index === this.highlightedIndex,
      });
    });
    return groups;
  }

  get showSearch() {
    if (this.args.filterable || this.args.searchable === false) {
      return false;
    }
    const threshold = this.args.searchThreshold ?? 8;
    return this.normalizedOptions.length > threshold;
  }

  get hasResults() {
    return this.filteredOptions.length > 0;
  }

  get selectedLabel() {
    const match = this.normalizedOptions.find(
      (o) => o.value === this.currentValue,
    );
    if (match) {
      return match.label;
    }
    return this.args.selectedLabel ?? '';
  }

  get triggerLabel() {
    return this.selectedLabel || (this.args.placeholder ?? 'Select...');
  }

  get inputValue() {
    return this.isOpen ? this.searchText : this.selectedLabel;
  }

  get emptyText() {
    if (this.isSearching) {
      return 'Searching...';
    }
    if (this.args.remote && !this.searchText.trim()) {
      return this.args.promptText ?? 'Type to search';
    }
    return this.args.emptyText ?? 'No results found';
  }

  @action
  registerRoot(element) {
    this.rootElement = element;
  }

  @action
  toggle() {
    if (this.args.disabled) {
      return;
    }
    if (this.isOpen) {
      this.close();
      return;
    }
    this.isOpen = true;
    this.highlightedIndex = -1;
    this.focusSearch();
  }

  focusSearch() {
    runTask(
      this,
      () => {
        this.rootElement?.querySelector('.nu-menu__search input')?.focus();
      },
      0,
    );
  }

  @action
  close() {
    this.isOpen = false;
    this.searchText = '';
    this.highlightedIndex = -1;
    if (this.args.remote) {
      this.remoteOptions = [];
      this.searchSeq += 1;
    }
  }

  @action
  select(option) {
    if (option.disabled) {
      return;
    }
    if (option.value === CREATE_VALUE) {
      this.runCreate();
      return;
    }
    this.internalValue = option.value;
    this.args.onSelect?.(option.value, option);
    this.close();
  }

  async runCreate() {
    const term = this.searchText.trim();
    if (!term || this.isCreating) {
      return;
    }
    this.isCreating = true;
    try {
      const created = await this.args.onCreate?.(term);
      if (isDestroyed(this) || !created) {
        return;
      }
      const value = created.value ?? created.id;
      this.internalValue = value;
      this.args.onSelect?.(value, created);
      this.close();
    } finally {
      if (!isDestroyed(this)) {
        this.isCreating = false;
      }
    }
  }

  // NuInput yields (value, event), not a raw DOM event.
  @action
  updateSearch(value) {
    this.searchText = value ?? '';
    this.highlightedIndex = -1;
    if (this.args.remote) {
      this.scheduleRemoteSearch();
    }
  }

  @action
  onFilterInput(value) {
    if (!this.isOpen) {
      this.isOpen = true;
    }
    if (this.args.selectedLabel && !String(value ?? '').trim()) {
      this.args.onClear?.();
    }
    this.updateSearch(value);
  }

  @action
  onFilterFocus() {
    if (!this.args.disabled) {
      this.isOpen = true;
    }
  }

  @action
  onFilterClear() {
    this.internalValue = undefined;
    this.args.onClear?.();
    this.updateSearch('');
  }

  scheduleRemoteSearch() {
    if (this.searchTimer) {
      cancelTask(this, this.searchTimer);
    }
    this.searchTimer = runTask(
      this,
      () => this.runRemoteSearch(),
      this.args.searchDebounce ?? 250,
    );
  }

  async runRemoteSearch() {
    const term = this.searchText.trim();
    const seq = ++this.searchSeq;
    if (term.length < this.minChars) {
      this.remoteOptions = [];
      this.isSearching = false;
      return;
    }
    this.isSearching = true;
    try {
      const results = await this.args.onSearch?.(term);
      if (isDestroyed(this) || seq !== this.searchSeq) {
        return;
      }
      this.remoteOptions = results ?? [];
    } catch {
      if (!isDestroyed(this) && seq === this.searchSeq) {
        this.remoteOptions = [];
      }
    } finally {
      if (!isDestroyed(this) && seq === this.searchSeq) {
        this.isSearching = false;
      }
    }
  }

  @action
  handleKeydown(event) {
    if (!this.isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        event.preventDefault();
        this.toggle();
      }
      return;
    }

    // A native <button> trigger also fires click on Enter/Space. Without this
    // the menu would close then immediately reopen.
    if (['Enter', ' ', 'Spacebar'].includes(event.key)) {
      event.stopPropagation();
    }

    const count = this.filteredOptions.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) {
          this.highlightedIndex = (this.highlightedIndex + 1) % count;
          this.scrollToHighlighted();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) {
          this.highlightedIndex = (this.highlightedIndex - 1 + count) % count;
          this.scrollToHighlighted();
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < count) {
          this.select(this.filteredOptions[this.highlightedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  scrollToHighlighted() {
    runTask(
      this,
      () => {
        this.rootElement
          ?.querySelector('.nu-menu__item.is-highlighted')
          ?.scrollIntoView({ block: 'nearest' });
      },
      0,
    );
  }
}
