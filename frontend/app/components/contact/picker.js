import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import {
  contactEmail,
  contactName,
  contactPhone,
  isLimited,
} from '../../utils/contact-display';

// Search results carry no shared label field: FULL has displayName, LIMITED only name parts.
function withPickerLabel(contact) {
  return { ...contact, pickerLabel: contactName(contact) };
}

// Parent decides whether the result becomes an id or inline details.
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

  // Picking a person searches the whole company, whatever region the topbar shows.
  get searchUrl() {
    return '/contacts?allRegions=true';
  }

  mapItem = withPickerLabel;

  get isLimited() {
    return isLimited(this.contact);
  }

  // Relation-loaded contacts lack displayName; fall back like the backend serializer.
  get selectedName() {
    const contact = this.contact;
    if (!contact) return '';
    return (
      contactName(contact) || contactPhone(contact) || contactEmail(contact)
    );
  }

  get attachedLastName() {
    return this.isLimited ? this.contact.lastInitial : this.contact?.lastName;
  }

  get attachedPhone() {
    return contactPhone(this.contact);
  }

  get conflict() {
    return this.args.conflict ?? null;
  }

  get conflictName() {
    return contactName(this.conflict);
  }

  get conflictPhone() {
    return contactPhone(this.conflict);
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
  useConflict() {
    this.select(this.conflict);
  }

  @action
  setVerifyPhone(value) {
    this.args.onVerifyPhoneChange?.(value);
  }

  @action
  toggleWhatsapp(checked) {
    this.args.onIdentityChange?.('isWhatsapp', checked);
  }

  @action
  create(term) {
    this.startCreating();
    this.args.onIdentityChange?.('firstName', term);
    return null;
  }
}
