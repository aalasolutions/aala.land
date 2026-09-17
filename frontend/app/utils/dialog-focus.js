// Focus trap, focus restore and body scroll lock shared by Nuvo::Modal and Nuvo::Drawer.

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Counted so a dialog opened from another dialog does not unlock too early.
let openDialogs = 0;
let overflowBeforeLock = '';

function lockScroll() {
  if (openDialogs === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogs += 1;
}

function unlockScroll() {
  openDialogs = Math.max(0, openDialogs - 1);
  if (openDialogs === 0) {
    document.body.style.overflow = overflowBeforeLock;
  }
}

function visibleFocusable(element) {
  return Array.from(element.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

// The close button is usually first in the markup; a form field reads better.
function firstMeaningful(element) {
  const items = visibleFocusable(element);
  const preferred = items.find(
    (el) => !el.classList.contains('nu-modal__close') && !el.classList.contains('nu-drawer__close'),
  );
  return preferred || items[0] || element;
}

export function openDialog(element) {
  const previouslyFocused = document.activeElement;
  lockScroll();

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = visibleFocusable(element);
    if (!items.length) {
      event.preventDefault();
      element.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !element.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  element.addEventListener('keydown', onKeydown);

  let released = false;
  return function releaseDialog() {
    if (released) return;
    released = true;
    element.removeEventListener('keydown', onKeydown);
    unlockScroll();
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };
}

export function focusFirstControl(element) {
  firstMeaningful(element).focus();
}
