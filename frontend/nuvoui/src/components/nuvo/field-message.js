import Component from '@glimmer/component';

const HINT_TONES = Object.freeze({
  warning: { modifier: 'm-warning', icon: 'warning' },
  success: { modifier: 'm-success', icon: 'check-circle' },
});

/**
 * The hint and error slot shared by `Nuvo::Field` and `Nuvo::FieldGroup`.
 *
 * - `@error` (string): shown with an icon, replaces the hint while present.
 * - `@hint` (string): helper text; colored and given an icon when `@status`
 *   is `warning` or `success`.
 * - `@status` (`error | warning | success`): tone of the hint.
 * - `@hintId`, `@errorId`: ids the parent lists in `aria-describedby`.
 *
 * The slot always renders and reserves one text line. It is a polite live
 * region, so a message that appears after the user moves on is announced.
 */
export default class NuFieldMessageComponent extends Component {
  get tone() {
    return HINT_TONES[this.args.status] ?? null;
  }

  get hintClasses() {
    const parts = ['nu-field__hint'];
    if (this.tone) {
      parts.push(this.tone.modifier);
    }
    return parts.join(' ');
  }

  get hintIcon() {
    return this.tone?.icon ?? null;
  }
}
