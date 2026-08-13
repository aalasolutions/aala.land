import { Raw } from 'typeorm';

// Display name for a contact, which has firstName/lastName (both nullable), not
// a single name. Falls back to the phone so an unnamed WhatsApp contact still
// renders something.
export function contactDisplayName(
  c: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null,
): string | null {
  if (!c) return null;
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.phone || null;
}

// A contact-display name that never returns null: used where a string is
// required (notification messages, report flags).
export function contactDisplayNameOr(
  c: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null,
  fallback = 'this lead',
): string {
  return contactDisplayName(c) ?? fallback;
}

// Attach `displayName` to a contact object. The contacts endpoint computes it
// in ContactsService.serialize, but a raw Contact returned through a relation
// (lease.contact, unit.owner) carries no such field, so consumers reading
// `.contact.displayName` get undefined. Call this wherever an embedded contact
// leaves the API. Mutates and returns the same object.
export function attachDisplayName<
  T extends {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  },
>(contact: T | null): T | null {
  if (!contact) return contact;
  (contact as T & { displayName: string | null }).displayName =
    contactDisplayName(contact);
  return contact;
}

// The number is the identity, within a company. Normalise to digits and keep the
// last 9 so +971501234567, 0501234567 and 501234567 are one person without a
// country-code table.
export function normalizePhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits || null;
}

// A TypeORM FindOperators `phone` matcher that compares the last 9 digits of the
// stored column against the last 9 digits of the input. Mirrors the
// name-normalization pattern: matches happen in SQL so a stored number with
// spaces, dashes or brackets (most of them) still resolves. The leading-wildcard
// ILIKE scan is gone.
export function phoneDigitsWhere(inputPhone: string | null | undefined) {
  const digits = normalizePhone(inputPhone);
  return Raw(
    (alias) =>
      `RIGHT(regexp_replace(${alias}, '\\D', '', 'g'), 9) = :phoneDigits`,
    { phoneDigits: digits ?? '' },
  );
}

// Exact, case-insensitive email match. NOT an ILIKE: _ and % are wildcards in
// LIKE/ILIKE, and emails legitimately contain _, so `john_doe@x` would match
// `johnbdoe@x` and wrongly merge two identities.
export function emailEqualsWhere(inputEmail: string | null | undefined) {
  const email = (inputEmail ?? '').trim().toLowerCase();
  return Raw((alias) => `LOWER(${alias}) = :email`, { email });
}
