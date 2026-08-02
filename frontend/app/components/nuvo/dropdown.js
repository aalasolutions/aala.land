import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { registerDestructor } from '@ember/destroyable';
import { runTask } from 'ember-lifeline';

const PLACEMENTS = ['start', 'end', 'up'];
const ALIGNMENTS = ['start', 'center', 'end'];

export default class NuDropdownComponent extends Component {
  @tracked isOpen = false;
  @tracked searchText = '';
  @tracked highlightedIndex = -1;
  @tracked internalValue = undefined;

  rootElement = null;
  clickOutsideHandler = null;

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

  // Accepts {value,label,group,icon,danger,disabled} objects or plain strings.
  get normalizedOptions() {
    return (this.args.options || []).map((entry) => {
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
      };
    });
  }

  // Separators are decoration: they must never be selectable or land under the
  // keyboard cursor, so they are excluded from the navigable list entirely.
  get filteredOptions() {
    const term = this.searchText.trim().toLowerCase();
    const all = this.normalizedOptions.filter((o) => !o.separator);
    const matched = term
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

  // Separators render only in the unfiltered, ungrouped list. Once a search
  // term or grouping reorders things, a fixed divider position is meaningless.
  get flatRows() {
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
    if (this.args.searchable === false) {
      return false;
    }
    const threshold = this.args.searchThreshold ?? 8;
    return this.normalizedOptions.length > threshold;
  }

  get hasResults() {
    return this.filteredOptions.length > 0;
  }

  get triggerLabel() {
    const match = this.normalizedOptions.find(
      (o) => o.value === this.currentValue,
    );
    return match ? match.label : (this.args.placeholder ?? 'Select...');
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
  }

  @action
  select(option) {
    if (option.disabled) {
      return;
    }
    this.internalValue = option.value;
    this.args.onSelect?.(option.value, option);
    this.close();
  }

  // NuInput yields (value, event), not a raw DOM event.
  @action
  updateSearch(value) {
    this.searchText = value ?? '';
    this.highlightedIndex = -1;
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
