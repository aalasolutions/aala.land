import { ROLES } from './roles';

// Presented contacts are FULL or LIMITED; a LIMITED one carries only masked identity fields.
export function isLimited(contact) {
  return contact?.accessLevel === 'LIMITED';
}

// Mirrors the backend name: full name else phone; LIMITED: first name, initial, else masked phone.
export function contactName(contact) {
  if (!contact) return '';
  if (isLimited(contact)) {
    const name = [contact.firstName?.trim(), contact.lastInitial]
      .filter(Boolean)
      .join(' ');
    return name || contact.phoneMasked || '';
  }
  if (contact.displayName) return contact.displayName;
  const name = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || contact.phone || '';
}

export function contactPhone(contact) {
  if (!contact) return '';
  return (isLimited(contact) ? contact.phoneMasked : contact.phone) || '';
}

export function contactEmail(contact) {
  if (!contact || isLimited(contact)) return '';
  return contact.email || '';
}

// A wa.me link needs the real number, so only a FULL contact flagged as WhatsApp gets one.
export function canWhatsapp(contact) {
  return Boolean(
    contact && !isLimited(contact) && contact.phone && contact.isWhatsapp,
  );
}

// Mirrors the backend PATCH rule; ADMIN and MANAGER edit only inside their own regions.
export function canEditContact(contact, user) {
  if (!contact || !user) return false;
  switch (user.role) {
    case ROLES.SUPER_ADMIN:
    case ROLES.COMPANY_ADMIN:
      return true;
    case ROLES.ADMIN:
    case ROLES.MANAGER:
      return (user.regionCodes ?? []).includes(contact.regionCode);
    case ROLES.AGENT:
      return Boolean(contact.createdBy) && contact.createdBy === user.id;
    default:
      return false;
  }
}
