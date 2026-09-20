import Modifier from 'ember-modifier';
import { registerDestructor } from '@ember/destroyable';

const EDGE = 8;
const DEFAULT_GAP = 4;

// Positions a body-level element against its trigger, viewport-fixed, flipping
// to the opposite side when there is no room. Tracks the trigger on scroll and
// resize, dismissing only once the trigger itself leaves the viewport.
//
// {{anchor trigger placement="bottom" align="start" gap=4 matchWidth=false onDismiss=fn}}
// placement: top | bottom | start | end (logical, resolved against the trigger's direction)
// align: start | center | end, along the other axis (top/bottom only).
// Writes data-placement="top|bottom|left|right" and --nu-anchor--ArrowX/Y (trigger centre).
export default class AnchorModifier extends Modifier {
  element = null;
  trigger = null;
  options = null;
  observer = null;
  armed = false;
  frame = null;
  trackFrame = null;

  constructor(owner, args) {
    super(owner, args);
    registerDestructor(this, () => this.teardown());
  }

  modify(element, [trigger], named) {
    this.element = element;
    this.trigger = trigger;
    this.options = named;
    if (!trigger) return;

    this.reposition();

    if (!this.observer) {
      // Async content (remote search results) changes the height after open.
      this.observer = new ResizeObserver(() => this.reposition());
      this.observer.observe(element);
    }
    if (!this.armed) {
      this.armed = true;
      // Skip scrolls caused by the open itself (focus into view).
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        window.addEventListener('scroll', this.onViewportChange, {
          capture: true,
          passive: true,
        });
        window.addEventListener('resize', this.onViewportChange, {
          passive: true,
        });
      });
    }
  }

  // One pass per frame: scroll fires continuously and reposition reads layout.
  onViewportChange = () => {
    if (this.trackFrame) return;
    this.trackFrame = requestAnimationFrame(() => {
      this.trackFrame = null;
      if (this.triggerOffViewport()) {
        this.options?.onDismiss?.();
        return;
      }
      this.reposition();
    });
  };

  triggerOffViewport() {
    if (!this.trigger?.isConnected) return true;
    const { top, bottom, left, right } = this.trigger.getBoundingClientRect();
    return (
      bottom <= 0 ||
      right <= 0 ||
      top >= window.innerHeight ||
      left >= window.innerWidth
    );
  }

  reposition() {
    const { element, trigger } = this;
    if (!element?.isConnected || !trigger?.isConnected) return;
    const {
      placement = 'bottom',
      align = 'start',
      gap = DEFAULT_GAP,
      matchWidth = false,
    } = this.options;

    const rect = trigger.getBoundingClientRect();
    const rtl = getComputedStyle(trigger).direction === 'rtl';
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    element.dir = rtl ? 'rtl' : 'ltr';
    element.style.position = 'fixed';
    element.style.inset = 'auto';
    element.style.margin = '0';
    element.style.transform = 'none';
    // Cleared on the false branch too: setting it only when true left a stale
    // inline min-width behind when matchWidth flipped off.
    element.style.minInlineSize = matchWidth ? `${rect.width}px` : '';

    const size = element.getBoundingClientRect();
    const w = size.width;
    const h = size.height;

    const side = resolveSide(placement, rtl);
    const resolved = flipIfNeeded(side, rect, w, h, gap, vw, vh);

    let left;
    let top;
    if (resolved === 'top' || resolved === 'bottom') {
      top = resolved === 'bottom' ? rect.bottom + gap : rect.top - gap - h;
      left = alignInline(align, rect, w, rtl);
    } else {
      left = resolved === 'right' ? rect.right + gap : rect.left - gap - w;
      top = rect.top + rect.height / 2 - h / 2;
    }

    left = clamp(left, EDGE, Math.max(EDGE, vw - EDGE - w));
    top = clamp(top, EDGE, Math.max(EDGE, vh - EDGE - h));

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.dataset.placement = resolved;
    element.style.setProperty(
      '--nu-anchor--ArrowX',
      `${rect.left + rect.width / 2 - left}px`,
    );
    element.style.setProperty(
      '--nu-anchor--ArrowY',
      `${rect.top + rect.height / 2 - top}px`,
    );
  }

  teardown() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    if (this.trackFrame) {
      cancelAnimationFrame(this.trackFrame);
      this.trackFrame = null;
    }
    if (this.armed) {
      window.removeEventListener('scroll', this.onViewportChange, true);
      window.removeEventListener('resize', this.onViewportChange);
      this.armed = false;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.element = null;
    this.trigger = null;
  }
}

function resolveSide(placement, rtl) {
  if (placement === 'start') return rtl ? 'right' : 'left';
  if (placement === 'end') return rtl ? 'left' : 'right';
  return placement === 'top' ? 'top' : 'bottom';
}

// Flip only when the other side actually fits; otherwise the clamp handles it.
function flipIfNeeded(side, rect, w, h, gap, vw, vh) {
  const fitsBelow = rect.bottom + gap + h <= vh - EDGE;
  const fitsAbove = rect.top - gap - h >= EDGE;
  const fitsRight = rect.right + gap + w <= vw - EDGE;
  const fitsLeft = rect.left - gap - w >= EDGE;
  if (side === 'bottom' && !fitsBelow && fitsAbove) return 'top';
  if (side === 'top' && !fitsAbove && fitsBelow) return 'bottom';
  if (side === 'right' && !fitsRight && fitsLeft) return 'left';
  if (side === 'left' && !fitsLeft && fitsRight) return 'right';
  return side;
}

// The element's inline-start edge meets the trigger's inline-start edge (or end/end).
function alignInline(align, rect, w, rtl) {
  if (align === 'center') return rect.left + rect.width / 2 - w / 2;
  const startEdge = rtl ? rect.right - w : rect.left;
  const endEdge = rtl ? rect.left : rect.right - w;
  return align === 'end' ? endEdge : startEdge;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
