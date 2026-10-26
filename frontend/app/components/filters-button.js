import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { runTask } from 'ember-lifeline';

export default class FiltersButtonComponent extends Component {
  @tracked isOpen = false;

  @action open() {
    this.isOpen = true;
  }

  @action close() {
    this.isOpen = false;
  }

  // A button that disables itself on click (Clear) drops focus to the body; return it to the drawer.
  @action keepFocusInDrawer(event) {
    const drawer = event.currentTarget;
    const button = event.target.closest?.('button');
    if (!button || !drawer.contains(button)) return;
    runTask(
      this,
      () => {
        if (!button.disabled) return;
        const active = document.activeElement;
        if (active && active !== document.body && !active.disabled) return;
        drawer.querySelector('.wu-drawer__close')?.focus();
      },
      0,
    );
  }
}
