import Component from '@glimmer/component';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { TOOLTIP_ID } from '../../services/tooltip';

const GAP = 8;
const EDGE = 8;
const FLIP_MARGIN = 64;
const MAX_WIDTH = 256; // keep in sync with --nu-tooltip--MaxWidth (16rem)
const ARROW_LEAD = 20; // --nu-tooltip--ArrowInset (16) + half --nu-tooltip--ArrowSize (4)

// Physical modifier per logical placement, as [ltr, rtl].
const PHYSICAL = {
  start: ['left', 'right'],
  end: ['right', 'left'],
  'top-start': ['top-left', 'top-right'],
  'top-end': ['top-right', 'top-left'],
  'bottom-start': ['bottom-left', 'bottom-right'],
  'bottom-end': ['bottom-right', 'bottom-left'],
};

export default class NuTooltipHostComponent extends Component {
  @service tooltip;

  tooltipId = TOOLTIP_ID;

  constructor() {
    super(...arguments);

    this.onPointerOver = (event) => {
      const trigger = event.target?.closest?.('[data-tooltip]');
      if (trigger) {
        this.tooltip.show(trigger);
      } else {
        this.tooltip.hide();
      }
    };

    this.onPointerOut = (event) => {
      const trigger = event.target?.closest?.('[data-tooltip]');
      if (trigger && !trigger.contains(event.relatedTarget)) {
        this.tooltip.hide();
      }
    };

    this.onFocusIn = (event) => {
      const trigger = event.target?.closest?.('[data-tooltip]');
      if (trigger) {
        this.tooltip.show(trigger);
      }
    };

    this.onFocusOut = (event) => {
      const trigger = event.target?.closest?.('[data-tooltip]');
      if (this.tooltip.isCurrentTrigger(trigger)) {
        this.tooltip.hide();
      }
    };

    this.onKeydown = (event) => {
      if (event.key === 'Escape') {
        this.tooltip.hide();
      }
    };

    this.onViewportChange = () => {
      if (this.tooltip.isVisible) {
        this.tooltip.hide();
      }
    };

    document.addEventListener('mouseover', this.onPointerOver, {
      passive: true,
    });
    document.addEventListener('mouseout', this.onPointerOut, { passive: true });
    document.addEventListener('focusin', this.onFocusIn, { passive: true });
    document.addEventListener('focusout', this.onFocusOut, { passive: true });
    document.addEventListener('keydown', this.onKeydown);
    window.addEventListener('scroll', this.onViewportChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', this.onViewportChange, { passive: true });
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.removeEventListener('mouseover', this.onPointerOver);
    document.removeEventListener('mouseout', this.onPointerOut);
    document.removeEventListener('focusin', this.onFocusIn);
    document.removeEventListener('focusout', this.onFocusOut);
    document.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('scroll', this.onViewportChange, true);
    window.removeEventListener('resize', this.onViewportChange);
  }

  get isRtl() {
    return document.documentElement.dir === 'rtl';
  }

  get resolvedPlacement() {
    const rect = this.tooltip.anchor;
    const pair = PHYSICAL[this.tooltip.placement];
    const placement = pair
      ? pair[this.isRtl ? 1 : 0]
      : this.tooltip.placement;

    if (!rect) {
      return placement;
    }

    return this.#flipHorizontal(this.#flipVertical(placement, rect), rect);
  }

  // A `top` box grows upward, so it flips only when the trigger sits near the top edge.
  #flipVertical(placement, rect) {
    if (placement.startsWith('top') && rect.top < FLIP_MARGIN) {
      return placement.replace('top', 'bottom');
    }
    if (
      placement.startsWith('bottom') &&
      rect.bottom > window.innerHeight - FLIP_MARGIN
    ) {
      return placement.replace('bottom', 'top');
    }
    return placement;
  }

  // Leading edge of the panel, placed so the arrow lands just inside the trigger's leading edge.
  #cornerAnchor(rect, extendsRight) {
    const lead = Math.min(ARROW_LEAD, rect.width / 2);
    return extendsRight
      ? rect.right - lead - ARROW_LEAD
      : rect.left + lead + ARROW_LEAD;
  }

  // `-left` extends leftward from the trigger, so it is the one that overflows on the left.
  #flipHorizontal(placement, rect) {
    const fitsLeftward = this.#cornerAnchor(rect, false) - MAX_WIDTH >= EDGE;
    const fitsRightward =
      this.#cornerAnchor(rect, true) + MAX_WIDTH <= window.innerWidth - EDGE;

    if (placement.endsWith('-left') && !fitsLeftward && fitsRightward) {
      return placement.replace('-left', '-right');
    }
    if (placement.endsWith('-right') && !fitsRightward && fitsLeftward) {
      return placement.replace('-right', '-left');
    }
    return placement;
  }

  get classes() {
    const parts = ['nu-tooltip', `m-${this.resolvedPlacement}`];
    if (this.tooltip.light) {
      parts.push('m-light');
    }
    return parts.join(' ');
  }

  get style() {
    const rect = this.tooltip.anchor;
    if (!rect) {
      return htmlSafe('');
    }

    const centerX = Math.min(
      Math.max(rect.left + rect.width / 2, EDGE),
      window.innerWidth - EDGE,
    );
    const centerY = rect.top + rect.height / 2;

    switch (this.resolvedPlacement) {
      case 'top-left':
        return htmlSafe(
          `left:${this.#cornerAnchor(rect, false)}px;top:${rect.top - GAP}px;`,
        );
      case 'top-right':
        return htmlSafe(
          `left:${this.#cornerAnchor(rect, true)}px;top:${rect.top - GAP}px;`,
        );
      case 'bottom-left':
        return htmlSafe(
          `left:${this.#cornerAnchor(rect, false)}px;top:${rect.bottom + GAP}px;`,
        );
      case 'bottom-right':
        return htmlSafe(
          `left:${this.#cornerAnchor(rect, true)}px;top:${rect.bottom + GAP}px;`,
        );
      case 'bottom':
        return htmlSafe(`left:${centerX}px;top:${rect.bottom + GAP}px;`);
      case 'left':
        return htmlSafe(
          `right:${window.innerWidth - rect.left + GAP}px;top:${centerY}px;`,
        );
      case 'right':
        return htmlSafe(`left:${rect.right + GAP}px;top:${centerY}px;`);
      default:
        return htmlSafe(
          `left:${centerX}px;bottom:${window.innerHeight - rect.top + GAP}px;`,
        );
    }
  }
}
