import Modifier from 'ember-modifier';

// Keeps the tooltip inside the viewport: slides the box back in at an edge and
// shifts the arrow the other way so it still points at the trigger.
const EDGE = 8;
const ARROW_INSET = 12;

export default class TooltipFitModifier extends Modifier {
  modify(element, [, , placement]) {
    const edge = EDGE;

    // Measure unshifted, otherwise each run compounds the previous shift.
    element.style.setProperty('--nu-tooltip--ShiftX', '0px');
    element.style.setProperty('--nu-tooltip--ShiftY', '0px');
    element.style.setProperty('--nu-tooltip--ArrowShiftX', '0px');
    element.style.setProperty('--nu-tooltip--ArrowShiftY', '0px');
    element.style.removeProperty('max-inline-size');

    const available = window.innerWidth - edge * 2;
    if (element.getBoundingClientRect().width > available) {
      element.style.maxInlineSize = `${available}px`;
    }

    const rect = element.getBoundingClientRect();
    let shiftX = 0;
    let shiftY = 0;

    if (rect.left < edge) {
      shiftX = edge - rect.left;
    } else if (rect.right > window.innerWidth - edge) {
      shiftX = window.innerWidth - edge - rect.right;
    }

    if (rect.top < edge) {
      shiftY = edge - rect.top;
    } else if (rect.bottom > window.innerHeight - edge) {
      shiftY = window.innerHeight - edge - rect.bottom;
    }

    if (!shiftX && !shiftY) return;

    element.style.setProperty('--nu-tooltip--ShiftX', `${shiftX}px`);
    element.style.setProperty('--nu-tooltip--ShiftY', `${shiftY}px`);

    // The arrow travels back, but never past the rounded corner.
    const horizontal = placement === 'left' || placement === 'right';
    const limit = Math.max(
      0,
      (horizontal ? rect.height : rect.width) / 2 - ARROW_INSET,
    );
    const clamp = (value) => Math.max(-limit, Math.min(limit, -value));
    element.style.setProperty(
      '--nu-tooltip--ArrowShiftX',
      `${horizontal ? 0 : clamp(shiftX)}px`,
    );
    element.style.setProperty(
      '--nu-tooltip--ArrowShiftY',
      `${horizontal ? clamp(shiftY) : 0}px`,
    );
  }
}
