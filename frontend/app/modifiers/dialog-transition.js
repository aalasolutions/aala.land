import Modifier from 'ember-modifier';
import { registerDestructor } from '@ember/destroyable';
import { runTask, cancelTask } from 'ember-lifeline';

// Enter and leave transitions driven by an `open` flag, all as run-loop tasks so
// `settled()` awaits every step. The reveal forces a style flush first, which
// commits the closed position as the transition's start point without a frame.
export default class DialogTransitionModifier extends Modifier {
  openTask = null;
  revealTask = null;
  hideTask = null;
  hideTimer = null;

  constructor(owner, args) {
    super(owner, args);
    registerDestructor(this, () => this.clearPending());
  }

  modify(element, [open], named) {
    this.clearPending();
    const { onOpen, onVisible, onHide, onHidden } = named;

    if (open) {
      this.openTask = runTask(
        this,
        () => {
          this.openTask = null;
          onOpen?.();
          // Runs after the mount has rendered.
          this.revealTask = runTask(
            this,
            () => {
              this.revealTask = null;
              void element.offsetWidth;
              onVisible?.();
            },
            0,
          );
        },
        0,
      );
      return;
    }

    this.hideTask = runTask(
      this,
      () => {
        this.hideTask = null;
        onHide?.();
        const duration =
          parseFloat(getComputedStyle(element).transitionDuration) || 0;
        this.hideTimer = runTask(
          this,
          () => {
            this.hideTimer = null;
            onHidden?.();
          },
          duration * 1000,
        );
      },
      0,
    );
  }

  clearPending() {
    for (const key of ['openTask', 'revealTask', 'hideTask', 'hideTimer']) {
      if (this[key] !== null) {
        cancelTask(this, this[key]);
        this[key] = null;
      }
    }
  }
}
