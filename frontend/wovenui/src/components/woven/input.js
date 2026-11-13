import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus } from './-field-status.js';
import { SIZE_MAP } from './-constants';
import InputControl from './input-control';

const LTR_TYPES = ['tel', 'number', 'email', 'url'];

/**
 * Text input. `@status` (`error | warning | success`, with `@invalid` and
 * `@valid` as aliases) sets `data-wu-status`; only `error` is styled, through
 * `aria-invalid`.
 * `@inputmode` picks the on-screen keyboard: phones use `type="tel"` with
 * `inputmode="tel"`; codes, OTPs, cheque and postal numbers use `type="text"`
 * with `inputmode="numeric"` (and `pattern="[0-9]*"`); money and quantities keep
 * `type="number"`.
 */
export default class WovenInputComponent extends Component {
  InputControl = InputControl;

  get size() {
    return SIZE_MAP[this.args.size] ?? null;
  }

  // Sizes go on the affix wrapper when there is one, as the CSS kit expects.
  get hasAffix() {
    return Boolean(
      this.args.prefixIcon || this.args.suffixIcon || this.args.clearable,
    );
  }

  get affixClasses() {
    return ['wu-input-affix', this.size].filter(Boolean).join(' ');
  }

  get classes() {
    return ['wu-input', this.size].filter(Boolean).join(' ');
  }

  get status() {
    return resolveStatus(this.args);
  }

  get isInvalid() {
    return this.status === 'error';
  }

  get type() {
    return this.args.type || 'text';
  }

  // Numbers, phones and addresses read LTR inside an RTL page.
  get dir() {
    return LTR_TYPES.includes(this.type) ? 'ltr' : undefined;
  }

  get hasValue() {
    const value = this.args.value;
    return value !== undefined && value !== null && value !== '';
  }

  // No hover gate: that would keep the button out of tab order for keyboard and touch users.
  get showClear() {
    return Boolean(
      this.args.clearable &&
        !this.args.disabled &&
        !this.args.readonly &&
        this.hasValue,
    );
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
