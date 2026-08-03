import Component from '@glimmer/component';
import { action } from '@ember/object';

const SIZES = ['sm', 'lg'];

export default class NuInputComponent extends Component {
  get wrapClasses() {
    const parts = ['nu-input-wrap'];
    if (this.args.prefixIcon) {
      parts.push('m-has-prefix');
    }
    if (this.hasSuffixSlot) {
      parts.push('m-has-suffix');
    }
    return parts.join(' ');
  }

  get classes() {
    const parts = ['nu-input'];
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.auto) {
      parts.push('m-auto');
    }
    if (this.args.invalid) {
      parts.push('is-invalid');
    } else if (this.args.valid) {
      parts.push('is-valid');
    }
    return parts.join(' ');
  }

  get type() {
    return this.args.type || 'text';
  }

  get hasValue() {
    const value = this.args.value;
    return value !== undefined && value !== null && value !== '';
  }

  // Rendered whenever there is something to clear: a hover gate would keep the
  // button out of the tab order for keyboard and touch users.
  get showClear() {
    return Boolean(
      this.args.clearable &&
        !this.args.disabled &&
        !this.args.readonly &&
        this.hasValue,
    );
  }

  get hasSuffixSlot() {
    return Boolean(this.args.suffixIcon || this.args.clearable);
  }

  @action
  handleInput(event) {
    this.args.onInput?.(event.target.value, event);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.value, event);
  }

  @action
  handleClear() {
    this.args.onInput?.('');
    this.args.onClear?.();
  }
}
