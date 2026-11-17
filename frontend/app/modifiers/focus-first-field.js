import { modifier } from 'ember-modifier';

// Moves focus to the first field or button inside the element when it renders.
export default modifier((element) => {
  element
    .querySelector('input, [data-test-wu-dropdown-trigger], button')
    ?.focus();
});
