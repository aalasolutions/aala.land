import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { guidFor } from '@ember/object/internals';

const NATIVE_CONTROLS = 'input, textarea, select';
const FALLBACK_CONTROLS = '[role="combobox"], [role="listbox"], button';

export default class NuFieldComponent extends Component {
  labelId = `nu-field-label-${guidFor(this)}`;
  controlId = `nu-field-control-${guidFor(this)}`;

  get classes() {
    const parts = ['nu-field'];
    if (this.args.horizontal) {
      parts.push('m-horizontal');
    }
    if (this.args.flush) {
      parts.push('m-flush');
    }
    return parts.join(' ');
  }

  get showError() {
    return Boolean(this.args.error);
  }

  get showHint() {
    return Boolean(this.args.hint) && !this.showError;
  }

  linkControl = modifier((element) => {
    const label = element.querySelector('.nu-field__label');
    if (!label) {
      return;
    }

    const native = element.querySelector(NATIVE_CONTROLS);
    if (native) {
      if (!native.id) {
        native.id = this.controlId;
      }
      if (!label.getAttribute('for')) {
        label.setAttribute('for', native.id);
      }
      return;
    }

    // The tooltip button is a button inside the field but never the control.
    const fallback = Array.from(element.querySelectorAll(FALLBACK_CONTROLS)).find(
      (candidate) => !candidate.classList.contains('nu-field__info'),
    );
    if (
      fallback &&
      !fallback.getAttribute('aria-label') &&
      !fallback.getAttribute('aria-labelledby')
    ) {
      fallback.setAttribute('aria-labelledby', label.id);
    }
  });
}
