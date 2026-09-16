import { Raw } from 'typeorm';

// Falls back to phone since firstName/lastName are nullable
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

// Never returns null, for call sites that require a string (notification messages, report flags).
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

// Raw relations lack the displayName field ContactsService.serialize computes
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

// Last 9 digits resolve +971501234567, 0501234567, 501234567 without a country-code table
export function normalizePhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits || null;
}

// Mirrors normalizePhone in SQL, avoiding a leading-wildcard ILIKE scan
export function phoneDigitsWhere(inputPhone: string | null | undefined) {
  const digits = normalizePhone(inputPhone);
  return Raw(
    (alias) =>
      `RIGHT(regexp_replace(${alias}, '\\D', '', 'g'), 9) = :phoneDigits`,
    { phoneDigits: digits ?? '' },
  );
}

// Exact match, not ILIKE: _ and % are legitimate email characters, not wildcards here
export function emailEqualsWhere(inputEmail: string | null | undefined) {
  const email = (inputEmail ?? '').trim().toLowerCase();
  return Raw((alias) => `LOWER(${alias}) = :email`, { email });
}
