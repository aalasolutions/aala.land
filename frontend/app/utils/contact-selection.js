import { tracked } from '@glimmer/tracking';

export const CONTACT_REQUIRED_ERROR =
  'Select a contact, or enter a name, phone or email to create one.';

export const OWNER_REQUIRED_ERROR =
  'Select an owner from contacts, or enter a name, phone or email to create one.';

// A person being attached to something: an existing contact, or details the
// backend resolves into one. Shared by every form that attaches a person, so
// unit owner and lead capture behave identically. The mutators are bound class
// fields, so templates call them without a per-controller @action wrapper.
export default class ContactSelection {
  @tracked contact = null;
  @tracked identity = {};

  attach = (contact) => {
    this.contact = contact ?? null;
    this.identity = {};
  };

  clear = () => {
    this.contact = null;
    this.identity = {};
  };

  reset = () => {
    this.clear();
  };

  setField = (field, value) => {
    this.identity = { ...this.identity, [field]: value };
  };

  get contactId() {
    return this.contact?.id ?? null;
  }

  get hasIdentity() {
    const { firstName, lastName, phone, email } = this.identity;
    return Boolean(
      firstName?.trim() || lastName?.trim() || phone?.trim() || email?.trim(),
    );
  }

  // UI-level requirement. The API keeps these optional so imports and other
  // clients are unaffected.
  get isPresent() {
    return Boolean(this.contact) || this.hasIdentity;
  }

  // Trimmed details for the resolve-or-create path. Empty when a contact is
  // attached, since the id is what gets sent then.
  get cleanIdentity() {
    if (this.contact || !this.hasIdentity) return {};
    const { firstName, lastName, email, phone, isWhatsapp } = this.identity;
    return {
      ...(firstName?.trim() ? { firstName: firstName.trim() } : {}),
      ...(lastName?.trim() ? { lastName: lastName.trim() } : {}),
      ...(email?.trim() ? { email: email.trim() } : {}),
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
      ...(isWhatsapp ? { isWhatsapp: true } : {}),
    };
  }
}
