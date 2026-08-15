import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

// Owner of a property. Search the company's contacts and attach one, or type a
// name that has no match and fill the details to create the contact on save.
// The parent reads `value` and sends either ownerId or the owner identity.
export default class UnitOwnerPickerComponent extends Component {
  @tracked isCreating = false;

  get contact() {
    return this.args.contact ?? null;
  }

  get identity() {
    return this.args.identity ?? {};
  }

  get isAttached() {
    return Boolean(this.contact);
  }

  get searchUrl() {
    return '/contacts';
  }

  // Units loaded through the asset listing carry a raw contact with no
  // displayName, so fall back the same way the backend serializer does.
  get selectedName() {
    const contact = this.contact;
    if (!contact) return '';
    if (contact.displayName) return contact.displayName;
    const name = [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name || contact.phone || contact.email || '';
  }

  get notes() {
    return this.contact?.notes ?? '';
  }

  @action
  select(contact) {
    this.isCreating = false;
    this.args.onSelectContact?.(contact);
  }

  @action
  clear() {
    this.isCreating = false;
    this.args.onClear?.();
  }

  @action
  startCreating() {
    this.isCreating = true;
    this.args.onClear?.();
  }

  @action
  setIdentity(field, value) {
    this.args.onIdentityChange?.(field, value);
  }

  @action
  toggleWhatsapp(checked) {
    this.args.onIdentityChange?.('isWhatsapp', checked);
  }
}
