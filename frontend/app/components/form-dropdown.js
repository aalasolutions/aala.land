import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { registerDestructor } from '@ember/destroyable';

export default class FormDropdownComponent extends Component {
  @tracked isOpen = false;
  @tracked searchText = '';
  @tracked dropdownPosition = null;
  @tracked isInModal = false;
  clickOutsideHandler = null;

  constructor() {
    super(...arguments);
    this.setupClickOutsideHandler();
    registerDestructor(this, () => this.cleanup());
  }

  get displayText() {
    if (this.args.value && this.args.options) {
      const selectedOption = this.args.options.find(opt => opt.value === this.args.value);
      return selectedOption ? selectedOption.label : this.args.placeholder || 'Select...';
    }
    return this.args.placeholder || 'Select...';
  }

  get filteredOptions() {
    if (!this.searchText) {
      return this.args.options || [];
    }

    const searchLower = this.searchText.toLowerCase();
    return (this.args.options || []).filter(opt =>
      opt.label.toLowerCase().includes(searchLower)
    );
  }

  get showSearch() {
    const optionCount = (this.args.options || []).length;
    const threshold = this.args.searchThreshold || 8;
    return optionCount > threshold;
  }

  setupClickOutsideHandler() {
    this.clickOutsideHandler = (event) => {
      if (this.isOpen) {
        const dropdownContainer = document.getElementById(this.args.id)?.closest('.form-dropdown');
        if (dropdownContainer && !dropdownContainer.contains(event.target)) {
          this.closeDropdown();
        }
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

  calculateDropdownPosition() {
    const triggerElement = document.getElementById(this.args.id);
    if (!triggerElement) return null;

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
      openUpward: false
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
      position.openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      position.top = position.openUpward
        ? triggerRect.top - dropdownHeight - 4
        : triggerRect.bottom + 4;
    }

    return position;
  }

  @action
  toggleDropdown() {
    if (this.args.disabled) return;

    if (!this.isOpen) {
      this.dropdownPosition = this.calculateDropdownPosition();
    } else {
      this.dropdownPosition = null;
    }

    this.isOpen = !this.isOpen;
    if (!this.isOpen) {
      this.searchText = '';
      this.dropdownPosition = null;
    }
  }

  @action
  closeDropdown() {
    this.isOpen = false;
    this.searchText = '';
    this.dropdownPosition = null;
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
  }

  @action
  handleKeydown(event) {
    switch (event.key) {
      case 'Escape':
        this.closeDropdown();
        break;
      case 'Enter':
        if (this.isOpen) {
          event.preventDefault();
        }
        break;
    }
  }
}