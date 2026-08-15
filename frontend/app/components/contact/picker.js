import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';

// Attach a person: search the company's contacts and pick one, or type a name
// that has no match and fill the details so the backend creates the contact on
// save. Used for the unit owner and for lead capture; the parent decides
// whether that becomes an id or inline details.
export default class ContactPickerComponent extends Component {
  @tracked isCreating = false;

  // Two pickers can share a page, so field ids must not collide.
  fieldPrefix = guidFor(this);

  get label() {
    return this.args.label ?? 'Contact';
  }

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

  // Contacts loaded through a relation carry no displayName, so fall back the
  // same way the backend serializer does.
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
