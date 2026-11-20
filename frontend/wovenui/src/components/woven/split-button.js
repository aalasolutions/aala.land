import Component from '@glimmer/component';
import { action } from '@ember/object';
import { VARIANT_CLASSES } from './button';
import { SIZE_MAP } from './-constants';

const MENU_KEYS = ['Enter', ' ', 'Spacebar', 'ArrowDown', 'ArrowUp'];

// A primary action joined to a caret that opens a menu of related actions (kit wu-btn-group + wu-btn caret).
// The whole group is the Dropdown root so the menu anchors under it; the primary stops the keys the root
// would otherwise read as "open the menu", so Enter and Space on it stay a plain click.
export default class WovenSplitButtonComponent extends Component {
  get variant() {
    return this.args.variant ?? 'subtle';
  }

  get caretClasses() {
    const parts = ['wu-btn', 'caret'];
    const variant = VARIANT_CLASSES[this.variant];
    const size = SIZE_MAP[this.args.size];
    if (variant) parts.push(variant);
    if (size) parts.push(size);
    return parts.join(' ');
  }

  get menuLabel() {
    return this.args.menuLabel ?? 'More actions';
  }

  get isDisabled() {
    return Boolean(this.args.disabled);
  }

  @action
  keepPrimaryKeys(event) {
    if (MENU_KEYS.includes(event.key)) {
      event.stopPropagation();
    }
  }
}
