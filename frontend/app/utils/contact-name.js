// A limited contact has no displayName, so fall back to first name plus last initial.
export function contactName(contact, fallback = '') {
  if (contact?.displayName) return contact.displayName;
  const first = contact?.firstName?.trim() ?? '';
  const initial = Array.from(contact?.lastName?.trim() ?? '')[0];
  const name = [first, initial ? `${initial}.` : ''].filter(Boolean).join(' ');
  return name || fallback;
}
