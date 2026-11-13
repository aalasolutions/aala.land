import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { guidFor } from '@ember/object/internals';
import {
  applyDescribedBy,
  applyRequired,
  applyStatus,
  messageIds,
  resolveFieldStatus,
} from './-field-status.js';

const NATIVE_CONTROLS = 'input, textarea, select';
const FALLBACK_CONTROLS = '[role="combobox"], [role="listbox"], button';
const LABELS = '.wu-field-label';
const TEXT_CONTROLS = ['INPUT', 'TEXTAREA'];
const VALUE_CONTROLS = ['INPUT', 'TEXTAREA', 'SELECT'];
const VALUE_EVENTS = ['input', 'change', 'focusout'];

/**
 * Wraps one control with its label, hint and error, and wires them together.
 *
 * Arguments:
 * - `@label`: static label above the control.
 * - `@placeholder`: used only when `@label` is absent. The text becomes a
 *   floating label inside the control that rises on focus or once there is a
 *   value. The native placeholder is set to a single space. Put format
 *   guidance in `@hint`, since a floated label leaves no room for an example.
 * - `@hint`, `@error`: the message line under the control (kit `live`). The
 *   error replaces the hint. The line is always reserved.
 * - `@status`: `error | warning | success`. `@invalid` aliases `error`,
 *   `@valid` aliases `success`, and a non-empty `@error` implies `error`.
 * - `@required`: `aria-required` on the control; the CSS kit draws the label asterisk from it.
 * - `@horizontal`: label beside the control. `@tooltip`: help text in a native
 *   popover opened by the kit `wu-field-help` button.
 *
 * The control (first native input, textarea or select, else the first
 * combobox, listbox or button) receives, reactively:
 * - the label link: `for`/`id` for a native control, `aria-labelledby` otherwise;
 * - `aria-invalid="true"` while the status is `error`;
 * - `aria-describedby`: hint id, error id, then ids the caller already set;
 * - `aria-required="true"` while `@required` is set;
 * - `data-wu-field-status`.
 * A control given its own `@status`, `@invalid` or `@valid` keeps it.
 *
 * Yields a hash for controls that take the state as arguments:
 * `status`, `invalid`, `valid`, `required`, `controlId`, `labelId`, `hintId`,
 * `errorId`, `describedBy` (string of active message ids) and `placeholder`
 * (a single space in floating mode; pass it to a Select or Autocomplete so it
 * has an empty state the label can rest on).
 */
export default class WovenFieldComponent extends Component {
  labelId = `wu-field-label-${guidFor(this)}`;
  floatLabelId = `wu-field-float-label-${guidFor(this)}`;
  controlId = `wu-field-control-${guidFor(this)}`;
  hintId = `wu-field-hint-${guidFor(this)}`;
  errorId = `wu-field-error-${guidFor(this)}`;
  helpId = `wu-field-help-${guidFor(this)}`;

  get classes() {
    const parts = ['wu-field', 'live'];
    if (this.floating) {
      parts.push('floating');
    } else if (this.args.horizontal) {
      parts.push('horizontal');
    }
    return parts.join(' ');
  }

  get floating() {
    return !this.args.label && Boolean(this.args.placeholder);
  }

  get status() {
    return resolveFieldStatus(this.args);
  }

  get activeMessageIds() {
    return messageIds(this.args, this.hintId, this.errorId);
  }

  get api() {
    const status = this.status;
    return {
      status,
      invalid: status === 'error',
      valid: status === 'success',
      required: Boolean(this.args.required),
      controlId: this.controlId,
      labelId: this.floating ? this.floatLabelId : this.labelId,
      hintId: this.hintId,
      errorId: this.errorId,
      describedBy: this.activeMessageIds.join(' ') || undefined,
      placeholder: this.floating ? ' ' : undefined,
    };
  }

  findControl(element) {
    const native = element.querySelector(NATIVE_CONTROLS);
    if (native) {
      return native;
    }
    // The help button is a button inside the field but never the control.
    return (
      Array.from(element.querySelectorAll(FALLBACK_CONTROLS)).find(
        (candidate) => !candidate.classList.contains('wu-field-help'),
      ) ?? null
    );
  }

  linkLabel(label, control) {
    if (VALUE_CONTROLS.includes(control.tagName)) {
      if (!control.id) {
        control.id = this.controlId;
      }
      if (!label.getAttribute('for')) {
        label.setAttribute('for', control.id);
      }
      return;
    }
    if (
      !control.getAttribute('aria-label') &&
      !control.getAttribute('aria-labelledby')
    ) {
      control.setAttribute('aria-labelledby', label.id);
    }
  }

  // Reads every tracked input before any early return, so each change re-runs it.
  linkControl = modifier((element) => {
    const status = this.status;
    const required = Boolean(this.args.required);
    const describedBy = this.activeMessageIds;
    const floating = this.floating;

    const control = this.findControl(element);
    if (!control) {
      return;
    }

    const label = element.querySelector(LABELS);
    if (label) {
      this.linkLabel(label, control);
    }

    applyStatus(control, status);
    applyRequired(control, required);
    applyDescribedBy(control, [this.hintId, this.errorId], describedBy);

    if (!floating) {
      return;
    }
    return this.trackValue(element, control);
  });

  // Selects and custom controls have no `:placeholder-shown`, so `has-value` on the field is the fallback the styles read.
  trackValue(element, control) {
    const sync = () => {
      if (TEXT_CONTROLS.includes(control.tagName)) {
        control.setAttribute('placeholder', ' ');
      }
      const hasValue = VALUE_CONTROLS.includes(control.tagName)
        ? control.value !== ''
        : true;
      element.classList.toggle('has-value', hasValue);
    };
    sync();
    VALUE_EVENTS.forEach((name) => control.addEventListener(name, sync));
    return () => {
      VALUE_EVENTS.forEach((name) => control.removeEventListener(name, sync));
    };
  }
}
