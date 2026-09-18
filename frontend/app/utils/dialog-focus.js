import { macroCondition, isTesting } from '@embroider/macros';

// Focus trap, focus restore and scroll lock for Nuvo::Modal and Nuvo::Drawer.
// Positive `tabindex` inside a dialog is not supported: tab order is document order.

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Both come before the first control in the markup, and neither is worth focusing.
const NOT_FIRST_FOCUS = [
  'nu-modal__close',
  'nu-drawer__close',
  'nu-field__info',
];

// Open dialogs, oldest first: holds the scroll lock and decides who owns Escape.
const openDialogs = [];
let overflowBeforeLock = '';
// Listener teardown only: a sweep must not re-enter the stack or move focus.
const detachByElement = new WeakMap();

function forgetDetached() {
  let removed = false;
  for (let i = openDialogs.length - 1; i >= 0; i -= 1) {
    const element = openDialogs[i];
    if (element.isConnected) continue;
    openDialogs.splice(i, 1);
    removed = true;
    detachByElement.get(element)?.();
  }
  // The sweep can drop the last holder of the lock; nothing else restores it.
  if (removed && openDialogs.length === 0) {
    document.body.style.overflow = overflowBeforeLock;
  }
}

function lockScroll(element) {
  if (openDialogs.length === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogs.push(element);
}

function unlockScroll(element) {
  const index = openDialogs.indexOf(element);
  if (index !== -1) {
    openDialogs.splice(index, 1);
  }
  // A dialog removed without releasing must not hold the page scroll forever.
  forgetDetached();
  if (openDialogs.length === 0) {
    document.body.style.overflow = overflowBeforeLock;
  }
}

export function isTopmostDialog(element) {
  forgetDetached();
  return openDialogs[openDialogs.length - 1] === element;
}

function visibleFocusable(element) {
  return Array.from(element.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el === document.activeElement) return true;
    // No `checkOpacity`: a dialog is still fading in when its first control is focused.
    if (typeof el.checkVisibility === 'function') {
      // Both spellings: `checkVisibilityCSS` is the Chromium name for `visibilityProperty`.
      return el.checkVisibility({
        visibilityProperty: true,
        checkVisibilityCSS: true,
      });
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });
}

function firstMeaningful(element) {
  const items = visibleFocusable(element);
  const preferred = items.find(
    (el) => !NOT_FIRST_FOCUS.some((skip) => el.classList.contains(skip)),
  );
  return preferred || items[0] || element;
}

export function openDialog(element) {
  const previouslyFocused = document.activeElement;
  lockScroll(element);

  // On the document in capture, so focus that escaped the dialog is pulled back.
  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    if (!isTopmostDialog(element)) return;
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

  document.addEventListener('keydown', onKeydown, true);
  detachByElement.set(element, () =>
    document.removeEventListener('keydown', onKeydown, true),
  );

  let released = false;
  return function releaseDialog() {
    if (released) return;
    released = true;
    document.removeEventListener('keydown', onKeydown, true);
    unlockScroll(element);
    // Another dialog may hold focus by now; leave it alone.
    const active = document.activeElement;
    const focusMovedOn =
      active && active !== document.body && !element.contains(active);
    if (focusMovedOn) return;
    // A trigger re-rendered away would otherwise drop focus to <body>.
    const target =
      previouslyFocused?.isConnected &&
      typeof previouslyFocused.focus === 'function'
        ? previouslyFocused
        : document.querySelector('main') || document.body;
    target.focus?.();
  };
}

export function focusFirstControl(element) {
  firstMeaningful(element).focus();
}

// Tests share one page across modules; this clears the module state. Compiled
// out of a production build by the macro.
export function resetDialogStateForTesting() {
  if (macroCondition(isTesting())) {
    openDialogs
      .splice(0)
      .forEach((element) => detachByElement.get(element)?.());
    document.body.style.overflow = overflowBeforeLock;
    overflowBeforeLock = '';
  }
}
