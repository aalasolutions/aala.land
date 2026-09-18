import Modifier from 'ember-modifier';
import { registerDestructor } from '@ember/destroyable';
import { runTask } from 'ember-lifeline';
import {
  openDialog,
  focusFirstControl,
  isTopmostDialog,
} from 'land/utils/dialog-focus';

// Traps focus, locks page scroll, restores focus on close. Named args are read at
// event time, so toggling `closeOnEsc` while open does not reinstall the trap.
export default class DialogModifier extends Modifier {
  installed = false;
  options = null;
  release = null;
  onKeydown = null;

  constructor(owner, args) {
    super(owner, args);
    registerDestructor(this, () => this.teardown());
  }

  modify(element, positional, named) {
    this.options = named;
    if (this.installed) return;
    this.installed = true;

    this.release = openDialog(element);

    this.onKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (this.options.closeOnEsc === false) return;
      // Escape over a confirm modal must not also close the drawer underneath.
      if (!isTopmostDialog(element)) return;
      this.options.onEscape?.();
    };
    document.addEventListener('keydown', this.onKeydown);

    runTask(this, () => focusFirstControl(element), 0);
  }

  teardown() {
    if (this.onKeydown) {
      document.removeEventListener('keydown', this.onKeydown);
      this.onKeydown = null;
    }
    this.release?.();
    this.release = null;
  }
}
