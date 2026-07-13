import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { registerDestructor } from '@ember/destroyable';
import { runTask } from 'ember-lifeline';
import { htmlSafe } from '@ember/template';

export default class FormDropdownComponent extends Component {
  @tracked isOpen = false;
  @tracked searchText = '';
  @tracked highlightedIndex = -1;
  @tracked dropdownPosition = null;
  @tracked isInModal = false;
  clickOutsideHandler = null;
  dropdownElement = null;

  constructor() {
    super(...arguments);
    this.setupClickOutsideHandler();
    registerDestructor(this, () => this.cleanup());
  }

  get displayText() {
    if (
      this.args.value !== undefined &&
      this.args.value !== null &&
      this.args.options
    ) {

      const selectedOption = this.args.options.find(
        (opt) => opt.value === this.args.value,
      );
      return selectedOption
        ? selectedOption.label
        : this.args.placeholder || 'Select...';
    }
    return this.args.placeholder || 'Select...';
  }

  get hasGroups() {
    return (this.args.options || []).some((opt) => opt && opt.group);
  }

  get filteredOptions() {
    const options = this.args.options || [];
    const searchLower = this.searchText.toLowerCase();
    const filtered = this.searchText
      ? options.filter(
          (opt) =>
            (opt.label || '').toLowerCase().includes(searchLower) ||
            (opt.group || '').toLowerCase().includes(searchLower),
        )
      : options.slice();

    if (!this.hasGroups) {
      return filtered;
    }

    // Keep same-group options contiguous so the visual (grouped) order
    // matches the flat keyboard-navigation order. First-seen group order
    // and in-group option order are preserved.
    const order = [];
    const byGroup = new Map();
    filtered.forEach((opt) => {
      const key = opt.group || '';
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key).push(opt);
    });
    return order.flatMap((key) => byGroup.get(key));
  }

  get groupedOptions() {
    const groups = [];
    let current = null;
    this.filteredOptions.forEach((opt, index) => {
      const groupName = opt.group || null;
      if (!current || current.group !== groupName) {
        current = { group: groupName, options: [] };
        groups.push(current);
      }
      current.options.push({ option: opt, index });
    });
    return groups;
  }

  get showSearch() {
    const optionCount = (this.args.options || []).length;
    const threshold = this.args.searchThreshold || 8;
    return optionCount > threshold;
  }

  get dropdownMenuStyle() {
    if (!this.isInModal || !this.dropdownPosition) {
      return undefined;
    }

    const { top, left, width } = this.dropdownPosition;
    return htmlSafe(
      `position:fixed;top:${top}px;left:${left}px;width:${width}px;z-index:2000;max-height:300px;`,
    );
  }

  setupClickOutsideHandler() {
    this.clickOutsideHandler = (event) => {
      if (
        this.isOpen &&
        this.dropdownElement &&
        !this.dropdownElement.contains(event.target)
      ) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this.clickOutsideHandler, true);
  }

  cleanup() {
    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
      this.clickOutsideHandler = null;
    }
  }

  calculateDropdownPosition(triggerElement) {
    const triggerRect = triggerElement.getBoundingClientRect();
    const dropdownHeight = 300;
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    const modalPanel = triggerElement.closest('.modal-panel');
    this.isInModal = !!modalPanel;

    let position = {
      left: triggerRect.left,
      width: triggerRect.width,
      openUpward: false,
    };

    if (this.isInModal) {
      position.openUpward = spaceBelow < 150;

      if (position.openUpward) {
        const upwardHeight = Math.min(dropdownHeight, spaceAbove - 20);
        position.top = triggerRect.top - upwardHeight - 4;
      } else {
        position.top = triggerRect.bottom + 4;
      }
    } else {
      position.openUpward =
        spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      position.top = position.openUpward
        ? triggerRect.top - dropdownHeight - 4
        : triggerRect.bottom + 4;
    }

    return position;
  }

  @action
  toggleDropdown(event) {
    if (this.args.disabled) return;

    if (this.isOpen) {
      this.closeDropdown();
      return;
    }

    const triggerElement = event?.currentTarget
      ?.closest('.dropdown-container')
      ?.querySelector('.dropdown-trigger');
    this.dropdownElement = triggerElement?.closest('.form-dropdown') ?? null;
    this.dropdownPosition = triggerElement
      ? this.calculateDropdownPosition(triggerElement)
      : null;
    this.isOpen = true;
    this.highlightedIndex = -1;
    this.focusSearchInput();
  }

  focusSearchInput() {
    runTask(
      this,
      () => {
        const searchInput = this.dropdownElement?.querySelector(
          '.dropdown-search input',
        );
        if (searchInput) {
          searchInput.focus();
        }
      },
      0,
    );
  }

  @action
  closeDropdown() {
    this.isOpen = false;
    this.searchText = '';
    this.highlightedIndex = -1;
    this.dropdownPosition = null;
    this.isInModal = false;
    this.dropdownElement = null;
  }

  @action
  selectOption(option) {
    if (this.args.onChange && option?.value !== undefined) {
      this.args.onChange({ target: { value: option.value } });
      this.closeDropdown();
    }
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
    this.highlightedIndex = -1;
  }

  @action
  handleKeydown(event) {
    if (!this.isOpen) {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter'
      ) {
        event.preventDefault();
        this.toggleDropdown(event);
      }
      return;
    }

    const optionsCount = this.filteredOptions.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex + 1) % optionsCount;
        this.scrollToHighlighted();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex =
          (this.highlightedIndex - 1 + optionsCount) % optionsCount;
        this.scrollToHighlighted();
        break;
      case 'Enter':
        event.preventDefault();
        if (
          this.highlightedIndex >= 0 &&
          this.highlightedIndex < optionsCount
        ) {
          this.selectOption(this.filteredOptions[this.highlightedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.closeDropdown();
        break;
      case 'Tab':
        this.closeDropdown();
        break;
    }
  }

  scrollToHighlighted() {
    runTask(
      this,
      () => {
        const activeElement = document.querySelector(
          '.dropdown-option.highlighted',
        );
        if (activeElement) {
          activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      },
      0,
    );
  }
}
