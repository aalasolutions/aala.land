import { tracked } from '@glimmer/tracking';

export const OWNER_REQUIRED_ERROR =
  'Select an owner from contacts, or enter a name, phone or email to create one.';

// Owner of a property: either an existing contact or details the backend
// resolves into one. Shared by every unit form so all three stay identical.
// The mutators are bound class fields, so templates and components can call
// them directly without a per-controller @action wrapper.
export default class OwnerSelection {
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

  get hasIdentity() {
    const { firstName, lastName, phone, email } = this.identity;
    return Boolean(
      firstName?.trim() || lastName?.trim() || phone?.trim() || email?.trim(),
    );
  }

  // UI-level requirement. The API keeps the owner optional so imports and other
  // clients are unaffected.
  get isPresent() {
    return Boolean(this.contact) || this.hasIdentity;
  }

  get payload() {
    if (this.contact) return { ownerId: this.contact.id };
    if (!this.hasIdentity) return {};
    const { firstName, lastName, email, phone, isWhatsapp } = this.identity;
    return {
      owner: {
        ...(firstName?.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName?.trim() ? { lastName: lastName.trim() } : {}),
        ...(email?.trim() ? { email: email.trim() } : {}),
        ...(phone?.trim() ? { phone: phone.trim() } : {}),
        ...(isWhatsapp ? { isWhatsapp: true } : {}),
      },
    };
  }
}
