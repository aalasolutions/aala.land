import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const SIZES = ['sm', 'lg'];

export default class NuSegmentedComponent extends Component {
  @tracked internalValue = undefined;

  rootElement = null;

  get multiple() {
    return Boolean(this.args.multiple);
  }

  // Controlled when @value is passed, uncontrolled otherwise. Same pattern as
  // NuTabs. In multiple mode the value is an array.
  get currentValue() {
    const value =
      this.args.value !== undefined ? this.args.value : this.internalValue;
    if (this.multiple) {
      return Array.isArray(value) ? value : [];
    }
    return value ?? this.enabledOptions[0]?.id;
  }

  get enabledOptions() {
    return this.normalized.filter((option) => !option.disabled);
  }

  // Accepts `id` or `value` as the key so it drops into either existing
  // convention (nu-tabs uses `id`, nu-dropdown uses `value`).
  get normalized() {
    return (this.args.options || []).map((option) => ({
      ...option,
      id: option.id ?? option.value,
    }));
  }

  get options() {
    const current = this.currentValue;
    return this.normalized.map((option) => ({
      ...option,
      active: this.multiple
        ? current.includes(option.id)
        : option.id === current,
    }));
  }

  get classes() {
    const parts = ['nu-segmented'];
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.iconOnly) {
      parts.push('m-icon-only');
    }
    if (this.args.fill) {
      parts.push('m-fill');
    }
    return parts.join(' ');
  }

  @action
  registerRoot(element) {
    this.rootElement = element;
  }

  @action
  select(option) {
    if (option.disabled) {
      return;
    }

    if (this.multiple) {
      const current = this.currentValue;
      const next = current.includes(option.id)
        ? current.filter((id) => id !== option.id)
        : [...current, option.id];
      this.internalValue = next;
      this.args.onChange?.(next, option);
      return;
    }

    this.internalValue = option.id;
    this.args.onChange?.(option.id, option);
  }

  @action
  handleKeydown(event) {
    const enabled = this.enabledOptions;
    if (!enabled.length) {
      return;
    }

    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    // In multiple mode nothing is "current", so arrows walk from the focused
    // segment rather than from the selection.
    const focused = this.rootElement?.querySelector(
      '.nu-segmented__item:focus',
    );
    const focusedId = focused?.getAttribute('data-test-nu-segmented-item');
    const from = this.multiple ? focusedId : this.currentValue;
    const currentIndex = enabled.findIndex(
      (option) => String(option.id) === String(from),
    );

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabled.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabled.length - 1;
    }

    const next = enabled[nextIndex];
    // Single-select moves the value with focus (the standard radio-group
    // behaviour); multi-select only moves focus, so Space can toggle.
    if (!this.multiple) {
      this.select(next);
    }
    this.rootElement
      ?.querySelector(`[data-test-nu-segmented-item="${next.id}"]`)
      ?.focus();
  }
}
