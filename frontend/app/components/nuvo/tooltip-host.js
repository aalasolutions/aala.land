import Component from '@glimmer/component';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { TOOLTIP_ID } from '../../services/tooltip';

const GAP = 8;
const EDGE = 8;
// Width a side-placed tooltip needs before it flips to the other side.
const SIDE_ROOM = 260;

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

    // Touch fires no mouseout, so a tap elsewhere is what dismisses it.
    this.onTouchStart = (event) => {
      if (!event.target?.closest?.('[data-tooltip]')) {
        this.tooltip.hide();
      }
    };

    document.addEventListener('mouseover', this.onPointerOver, {
      passive: true,
    });
    document.addEventListener('touchstart', this.onTouchStart, {
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
    document.removeEventListener('touchstart', this.onTouchStart);
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

  // A side placement with no room flips to the other side, so the hint never
  // has to be slid on top of the control it describes.
  #flipHorizontal(side, rect) {
    if (!rect) return side;
    const roomLeft = rect.left >= SIDE_ROOM;
    const roomRight = rect.right <= window.innerWidth - SIDE_ROOM;
    // Neither side fits, as on a phone: use the block axis instead.
    if (!roomLeft && !roomRight) {
      return rect.top < window.innerHeight / 2 ? 'bottom' : 'top';
    }
    if (side === 'left' && !roomLeft) return 'right';
    if (side === 'right' && !roomRight) return 'left';
    return side;
  }

  get resolvedPlacement() {
    const placement = this.tooltip.placement;
    const rect = this.tooltip.anchor;

    if (placement === 'start') {
      return this.#flipHorizontal(this.isRtl ? 'right' : 'left', rect);
    }
    if (placement === 'end') {
      return this.#flipHorizontal(this.isRtl ? 'left' : 'right', rect);
    }
    if (placement === 'top' && rect && rect.top < 64) {
      return 'bottom';
    }
    if (
      placement === 'bottom' &&
      rect &&
      rect.bottom > window.innerHeight - 64
    ) {
      return 'top';
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
