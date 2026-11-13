import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { guidFor } from '@ember/object/internals';
import {
  applyNativeRequired,
  applyRequired,
  applyStatus,
  messageIds,
  resolveFieldStatus,
} from './-field-status.js';

const CONTROLS = 'input, select, textarea, [role="combobox"]';

/**
 * A set of related controls, usually checkboxes or radios, under one legend
 * with one hint and error slot. Renders `<fieldset>` + `<legend>`.
 *
 * Arguments: `@label` (legend text), `@required` (required on each radio,
 * `aria-required` on other controls; the CSS kit draws the legend asterisk from it),
 * `@hint`, `@error`, `@status` (`error | warning | success`; `@invalid` and
 * `@valid` alias it, a non-empty `@error` implies `error`).
 *
 * Status reaches every child the same way `Woven::Field` reaches its one
 * control: the group writes `aria-invalid` and `data-wu-field-status` onto each
 * native input, select, textarea or combobox inside it, and the control styles
 * read those attributes. A child given its own `@status`, `@invalid` or
 * `@valid` keeps it. The hint and error ids go on the fieldset's
 * `aria-describedby`, so the message is read when focus enters the group.
 * The status is re-applied whenever an argument changes; children added later
 * receive it on the next change.
 *
 * Yields `status`, `invalid`, `valid`, `hintId`, `errorId` and `describedBy`.
 */
export default class WovenFieldGroupComponent extends Component {
  hintId = `wu-field-group-hint-${guidFor(this)}`;
  errorId = `wu-field-group-error-${guidFor(this)}`;

  get status() {
    return resolveFieldStatus(this.args);
  }

  get describedBy() {
    return (
      messageIds(this.args, this.hintId, this.errorId).join(' ') || undefined
    );
  }

  get api() {
    const status = this.status;
    return {
      status,
      invalid: status === 'error',
      valid: status === 'success',
      hintId: this.hintId,
      errorId: this.errorId,
      describedBy: this.describedBy,
    };
  }

  applyToControls = modifier((element) => {
    const status = this.status;
    const required = Boolean(this.args.required);
    element.querySelectorAll(CONTROLS).forEach((control) => {
      applyStatus(control, status);
      // A control in a nested field or group takes that wrapper's own marker.
      if (control.closest('.wu-field, .wu-field-group') !== element) {
        return;
      }
      // aria-required is not allowed on a radio; native required marks the radio set.
      if (control.type === 'radio') {
        applyNativeRequired(control, required);
      } else {
        applyRequired(control, required);
      }
    });
  });
}
