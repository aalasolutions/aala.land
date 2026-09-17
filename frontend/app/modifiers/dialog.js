import { modifier } from 'ember-modifier';
import { openDialog, focusFirstControl } from 'land/utils/dialog-focus';

// Traps focus inside a dialog, locks page scroll, and restores focus on close.
// `onEscape` is called when Escape is pressed, unless `closeOnEsc` is false.
export default modifier(function dialog(element, _positional, named = {}) {
  const { onEscape, closeOnEsc = true } = named;

  const release = openDialog(element);

  const onKeydown = (event) => {
    if (event.key !== 'Escape' || closeOnEsc === false) return;
    onEscape?.();
  };
  document.addEventListener('keydown', onKeydown);

  const focusTimer = setTimeout(() => focusFirstControl(element), 0);

  return () => {
    clearTimeout(focusTimer);
    document.removeEventListener('keydown', onKeydown);
    release();
  };
});
