import { modifier } from 'ember-modifier';

// Drives a dialog's enter and leave transition from an `open` flag.
// Opening is two steps on purpose: `onOpen` mounts the element in its closed
// position, then `onVisible` runs after the next paint so the CSS transition has
// a start frame to move from. Mount and reveal in one step gives no animation.
// Closing mirrors it: `onHide` starts the leave transition, `onHidden` unmounts
// once the element's own transition-duration has passed.
export default modifier(function dialogTransition(element, [open], named = {}) {
  const { onOpen, onVisible, onHide, onHidden } = named;
  let firstFrame = null;
  let secondFrame = null;
  let hideTimer = null;

  if (open) {
    onOpen?.();
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => onVisible?.());
    });
  } else {
    onHide?.();
    const duration = parseFloat(getComputedStyle(element).transitionDuration) || 0;
    hideTimer = setTimeout(() => onHidden?.(), duration * 1000);
  }

  return () => {
    if (firstFrame !== null) cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    if (hideTimer !== null) clearTimeout(hideTimer);
  };
});
