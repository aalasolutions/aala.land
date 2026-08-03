import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { cancelTask, runTask } from 'ember-lifeline';

const PLACEMENTS = ['top', 'bottom', 'start', 'end'];
const DEFAULT_PLACEMENT = 'top';
const OPEN_DELAY = 120;

export const TOOLTIP_ID = 'nu-tooltip-active';

export default class TooltipService extends Service {
  @tracked content = null;
  @tracked placement = DEFAULT_PLACEMENT;
  @tracked light = false;
  @tracked anchor = null;

  #trigger = null;
  #openTask = null;
  #ownsDescribedBy = false;

  get isVisible() {
    return this.content !== null;
  }

  show(trigger) {
    const content = trigger?.getAttribute('data-tooltip');
    if (!content || trigger === this.#trigger) {
      return;
    }

    this.#clearPending();
    this.#releaseTrigger();
    this.#trigger = trigger;

    this.#openTask = runTask(
      this,
      () => {
        if (this.#trigger !== trigger || !trigger.isConnected) {
          return;
        }

        const raw = trigger.getAttribute('data-tooltip-position');
        this.placement = PLACEMENTS.includes(raw) ? raw : DEFAULT_PLACEMENT;
        this.light = trigger.hasAttribute('data-tooltip-light');
        this.anchor = trigger.getBoundingClientRect();
        this.content = content;

        if (!trigger.hasAttribute('aria-describedby')) {
          trigger.setAttribute('aria-describedby', TOOLTIP_ID);
          this.#ownsDescribedBy = true;
        }
      },
      OPEN_DELAY,
    );
  }

  // Delegation calls this on every pointer move that misses a trigger, and a
  // tracked setter dirties even when the value is unchanged.
  hide() {
    if (!this.#trigger && !this.#openTask && this.content === null) {
      return;
    }

    this.#clearPending();
    this.#releaseTrigger();
    this.content = null;
    this.anchor = null;
  }

  isCurrentTrigger(element) {
    return Boolean(element) && element === this.#trigger;
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.hide();
  }

  #clearPending() {
    if (this.#openTask) {
      cancelTask(this, this.#openTask);
      this.#openTask = null;
    }
  }

  #releaseTrigger() {
    if (this.#ownsDescribedBy) {
      this.#trigger?.removeAttribute('aria-describedby');
      this.#ownsDescribedBy = false;
    }
    this.#trigger = null;
  }
}
