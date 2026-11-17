import { click } from '@ember/test-helpers';

const MENU = '[data-test-wu-dropdown-menu]';

// The open row menu is hosted on a layer outside the rendering root.
export function rowMenuItem(key) {
  return document.querySelector(`${MENU} [data-test-${key}]`);
}

export async function clickRowAction(scope, key) {
  await click(`${scope} [data-test-row-actions-trigger]`);
  await click(rowMenuItem(key));
}

export async function rowActionKeys(scope = '') {
  const trigger = `${scope} [data-test-row-actions-trigger]`;
  await click(trigger);
  const keys = [...document.querySelectorAll(`${MENU} [data-test-row-action]`)].map(
    (el) => el.getAttribute('data-test-row-action'),
  );
  await click(trigger);
  return keys;
}
