import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { isDestroyed, registerDestructor } from '@ember/destroyable';
import { guidFor } from '@ember/object/internals';
import { service } from '@ember/service';
import { cancelTask, runTask } from 'ember-lifeline';
import { resolveStatus } from './-field-status.js';
import { SIZE_MAP } from './-constants';

const ALIGNMENTS = ['start', 'center', 'end'];

const CREATE_VALUE = '__wu_dropdown_create__';
const TRIGGER_FOCUSABLE = 'input, button, [tabindex]';

export default class WovenDropdownComponent extends Component {
  @service layer;

  menuId = `wu-menu-${guidFor(this)}`;

  @tracked isOpen = false;
  @tracked searchText = '';
  @tracked highlightedIndex = -1;
  @tracked internalValue = undefined;
  @tracked remoteOptions = [];
  @tracked isSearching = false;
  @tracked isCreating = false;

  rootElement = null;
  menuElement = null;
  clickOutsideHandler = null;
  escapeHandler = null;
  searchTimer = null;
  searchSeq = 0;
  // The first page from @searchOnOpen is fetched once per instance; typed terms always hit @onSearch.
  browseCache = null;

  // Inside an open dialog the menu must render in that dialog's layer, or it is inert.
  get layerElement() {
    return this.layer.elementFor(this.rootElement);
  }

  // The menu lives on .wu-layer; these map the kit's placement args to the anchor.
  get anchorPlacement() {
    return this.args.placement === 'up' ? 'top' : 'bottom';
  }

  get anchorAlign() {
    return this.args.placement === 'end' ? 'end' : 'start';
  }

  // Select-like dropdowns keep the menu at least as wide as the trigger.
  get matchWidth() {
    return ALIGNMENTS.includes(this.args.align);
  }

  // Controlled when @value is passed; otherwise falls back to internal state after a pick.
  get currentValue() {
    return this.args.value !== undefined ? this.args.value : this.internalValue;
  }

  constructor() {
    super(...arguments);
    this.clickOutsideHandler = (event) => {
      if (
        this.isOpen &&
        this.rootElement &&
        !this.rootElement.contains(event.target) &&
        !this.menuElement?.contains(event.target)
      ) {
        this.close();
      }
    };
    // Escape closes only the menu wherever focus is, before a dialog's cancel can see it.
    this.escapeHandler = (event) => {
      if (this.isOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.rootElement?.querySelector(TRIGGER_FOCUSABLE)?.focus();
        this.close();
      }
    };
    document.addEventListener('click', this.clickOutsideHandler, true);
    document.addEventListener('keydown', this.escapeHandler, true);
    registerDestructor(this, () => {
      document.removeEventListener('click', this.clickOutsideHandler, true);
      document.removeEventListener('keydown', this.escapeHandler, true);
      this.clickOutsideHandler = null;
      this.escapeHandler = null;
    });
  }

  get align() {
    return ALIGNMENTS.includes(this.args.align) ? this.args.align : null;
  }

  // Independent of the trigger: a menu can center options while a select keeps them at start.
  get optionsAlign() {
    return ALIGNMENTS.includes(this.args.optionsAlign)
      ? this.args.optionsAlign
      : null;
  }

  // `@status` (`error | warning | success`, `@invalid`/`@valid` aliases) lands on
  // the trigger button, or on the filter input when `@filterable`.
  get status() {
    return resolveStatus(this.args);
  }

  get triggerClasses() {
    const size = SIZE_MAP[this.args.size];
    return size ? `wu-select ${size}` : 'wu-select';
  }

  get emptyOnly() {
    return !this.hasResults && !this.showSearch;
  }

  optionId(index) {
    return `${this.menuId}-${index}`;
  }

  // The listbox id while it is rendered, so aria-controls never points at a missing element.
  get listboxId() {
    return this.isOpen && this.hasResults ? this.menuId : null;
  }

  get activeDescendant() {
    if (!this.isOpen || this.highlightedIndex < 0) {
      return null;
    }
    return this.optionId(this.highlightedIndex);
  }

  get optionSource() {
    if (!this.args.remote) {
      return this.args.options || [];
    }
    const pinned = this.pinnedCurrent;
    return pinned ? [pinned, ...this.remoteOptions] : this.remoteOptions;
  }

  // The first page loaded on open may not hold the current pick, so it is listed on top.
  get pinnedCurrent() {
    const value = this.args.value;
    if (
      !this.args.searchOnOpen ||
      this.searchText.trim() ||
      value === null ||
      value === undefined ||
      !this.args.selectedLabel ||
      this.remoteOptions.some((o) => o?.value === value)
    ) {
      return null;
    }
    return { value, label: this.args.selectedLabel, isCurrentPick: true };
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

  // Separators are decoration: they must never be selectable or land under the keyboard cursor.
  @cached
  get matchedOptions() {
    const term = this.searchText.trim().toLowerCase();
    const all = this.normalizedOptions.filter((o) => !o.separator);
    // @filter(options, term) replaces the built-in substring match for local options.
    let matched = all.slice();
    if (term && !this.args.remote) {
      matched = this.args.filter
        ? this.args.filter(all, term)
        : all.filter(
            (o) =>
              String(o.label).toLowerCase().includes(term) ||
              String(o.group ?? '')
                .toLowerCase()
                .includes(term),
          );
    }

    if (!matched.some((o) => o.group)) {
      return matched;
    }

    // Keep same-group entries contiguous so the flat keyboard index matches the visual order.
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

  row(option, index) {
    return {
      option,
      index,
      id: this.optionId(index),
      selected: option.value === this.currentValue,
      highlighted: index === this.highlightedIndex,
    };
  }

  // Separators only make sense in the unfiltered, ungrouped list order.
  get keepsSeparators() {
    if (this.args.remote || this.args.allowCreate || this.args.filterable) {
      return false;
    }
    return (
      !this.searchText.trim() && !this.normalizedOptions.some((o) => o.group)
    );
  }

  // Flat index is assigned here so keyboard nav and rendering agree.
  @cached
  get sections() {
    if (this.keepsSeparators) {
      let index = -1;
      const rows = this.normalizedOptions.map((option) => {
        if (option.separator) {
          return { separator: true };
        }
        index += 1;
        return this.row(option, index);
      });
      return [{ group: null, rows }];
    }
    const groups = [];
    let current = null;
    this.filteredOptions.forEach((option, index) => {
      const name = option.group || null;
      if (!current || current.group !== name) {
        current = { group: name, rows: [] };
        groups.push(current);
      }
      current.rows.push(this.row(option, index));
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

  // An empty-valued pick is a placeholder-like "All ..." option, so it gets no title.
  get triggerTitle() {
    const value = this.currentValue;
    if (value === '' || value === null || value === undefined) {
      return null;
    }
    return this.selectedLabel || null;
  }

  get triggerLabel() {
    return this.selectedLabel || (this.args.placeholder ?? 'Select...');
  }

  get inputValue() {
    return this.isOpen ? this.searchText : this.selectedLabel;
  }

  // While open the input holds the search, so the current pick shows as the placeholder.
  get filterPlaceholder() {
    if (this.isOpen && this.selectedLabel) {
      return this.selectedLabel;
    }
    return this.args.placeholder ?? 'Search...';
  }

  get emptyText() {
    if (this.isSearching) {
      return 'Searching...';
    }
    if (
      this.args.remote &&
      !this.searchText.trim() &&
      !this.args.searchOnOpen
    ) {
      return this.args.promptText ?? 'Type to search';
    }
    return this.args.emptyText ?? 'No results found';
  }

  @action
  registerRoot(element) {
    this.rootElement = element;
  }

  @action
  registerMenu(element) {
    this.menuElement = element;
    // Shown before the anchor measures it; kit open styles key on :popover-open.
    if (element.hasAttribute('popover')) element.showPopover?.();
  }

  @action
  forgetMenu(element) {
    if (this.menuElement === element) {
      this.menuElement = null;
    }
  }

  // Options are not focusable; a press on one must not move focus off the trigger or search box.
  @action
  keepFocus(event) {
    if (!event.target.closest('input')) {
      event.preventDefault();
    }
  }

  // Focus that was inside the hosted menu goes back to the trigger.
  returnFocus() {
    const active = document.activeElement;
    if (active && this.menuElement?.contains(active)) {
      this.rootElement?.querySelector(TRIGGER_FOCUSABLE)?.focus();
    }
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
    this.loadOnOpen();
    this.args.onOpen?.();
  }

  loadOnOpen() {
    if (this.args.remote && this.args.searchOnOpen) {
      this.runRemoteSearch();
    }
  }

  focusSearch() {
    runTask(
      this,
      () => {
        this.menuElement?.querySelector('.wu-dropdown-search input')?.focus();
      },
      0,
    );
  }

  @action
  close() {
    this.returnFocus();
    this.isOpen = false;
    this.searchText = '';
    this.highlightedIndex = -1;
    if (this.args.remote) {
      this.remoteOptions = [];
      this.searchSeq += 1;
      this.isSearching = false;
    }
  }

  // After a pick the filter input lets go of focus, so the next click opens the menu again.
  closeAfterPick() {
    this.close();
    if (this.args.filterable) {
      this.rootElement?.querySelector('input')?.blur();
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
    if (option.item?.isCurrentPick) {
      this.closeAfterPick();
      return;
    }
    this.internalValue = option.value;
    this.args.onSelect?.(option.value, option);
    this.closeAfterPick();
  }

  async runCreate() {
    const term = this.searchText.trim();
    if (!term || this.isCreating) {
      return;
    }
    this.isCreating = true;
    try {
      const created = await this.args.onCreate?.(term);
      if (isDestroyed(this)) {
        return;
      }
      if (!created) {
        this.close();
        return;
      }
      const value = created.value ?? created.id;
      this.browseCache = null;
      this.internalValue = value;
      this.args.onSelect?.(value, created);
      this.closeAfterPick();
    } finally {
      if (!isDestroyed(this)) {
        this.isCreating = false;
      }
    }
  }

  // Woven::Input yields (value, event), not a raw DOM event.
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
    if (this.args.disabled || this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.loadOnOpen();
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
    const browsing = this.args.searchOnOpen && term === '';
    if (browsing && this.browseCache) {
      this.remoteOptions = this.browseCache;
      this.isSearching = false;
      return;
    }
    if (term.length < this.minChars && !browsing) {
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
      if (browsing) {
        this.browseCache = this.remoteOptions;
      }
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

    if (this.menuElement?.hasAttribute('data-wu-menu-block')) {
      this.handleMenuBlockKeydown(event);
      return;
    }

    // A native button also fires click on Enter/Space, which would close then reopen the menu.
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
      case 'Tab':
        this.close();
        break;
    }
  }

  // A pick in a yielded <:menu> closes it on bubbling, after the item's own click handlers have run.
  @action
  onMenuBlockClick(event) {
    if (
      this.menuElement?.hasAttribute('data-wu-menu-block') &&
      event.target.closest('[role^="menuitem"]')
    ) {
      this.close();
    }
  }

  // A yielded <:menu> owns its items: arrows move focus between them, Enter and Space stay native.
  handleMenuBlockKeydown(event) {
    const items = [
      ...this.menuElement.querySelectorAll(
        '[role^="menuitem"]:not([disabled])',
      ),
    ];
    const index = items.indexOf(document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[index <= 0 ? items.length - 1 : index - 1]?.focus();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  // An action menu moves focus onto the item; a listbox keeps focus and only scrolls.
  scrollToHighlighted() {
    runTask(
      this,
      () => {
        const item = document.getElementById(
          this.optionId(this.highlightedIndex),
        );
        if (!item) {
          return;
        }
        if (this.menuElement?.getAttribute('role') === 'menu') {
          item.focus();
        } else {
          item.scrollIntoView({ block: 'nearest' });
        }
      },
      0,
    );
  }
}
