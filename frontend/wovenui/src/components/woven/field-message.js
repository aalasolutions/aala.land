import Component from '@glimmer/component';

// The CSS kit has no warning message, so a warning hint takes `info`.
const HINT_TONES = Object.freeze({
  warning: 'info',
  success: 'success',
});

/**
 * The hint and error message shared by `Woven::Field` and `Woven::FieldGroup`.
 *
 * - `@error` (string): `wu-field-message error`, replaces the hint while present.
 * - `@hint` (string): helper text; `success` or `info` when `@status` is
 *   `success` or `warning`.
 * - `@status` (`error | warning | success`): tone of the hint.
 * - `@hintId`, `@errorId`: ids the parent lists in `aria-describedby`.
 *
 * Renders the message as a direct child of the wrapper, so the kit `live`
 * field reserves its line and the active message id joins `aria-describedby`.
 */
export default class WovenFieldMessageComponent extends Component {
  get hintClasses() {
    return ['wu-field-message', HINT_TONES[this.args.status]]
      .filter(Boolean)
      .join(' ');
  }
}
