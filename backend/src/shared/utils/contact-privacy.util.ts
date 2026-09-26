// Subscriber length normalizePhone matches on; digits before it are the country or trunk prefix.
const SUBSCRIBER_DIGITS = 9;

// Masks the middle of the subscriber number, keeping its first two and last two digits.
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 6) {
    return '*'.repeat(Math.max(digits.length - 2, 0)) + digits.slice(-2);
  }

  const prefixDigits =
    digits.length > SUBSCRIBER_DIGITS
      ? digits.slice(0, -SUBSCRIBER_DIGITS)
      : '';
  const subscriber = prefixDigits ? digits.slice(-SUBSCRIBER_DIGITS) : digits;

  const masked = '*'
    .repeat(subscriber.length - 4)
    .replace(/(.{3})(?=.)/g, '$1 ');
  const body = `${subscriber.slice(0, 2)} ${masked}${subscriber.slice(-2)}`;
  if (!prefixDigits) return body;

  const trimmed = phone.trim();
  const prefix = trimmed.startsWith('+')
    ? `+${prefixDigits}`
    : prefixDigits.startsWith('00') && prefixDigits.length > 2
      ? `+${prefixDigits.slice(2)}`
      : prefixDigits;
  return `${prefix} ${body}`;
}

// First letter plus a period; Array.from keeps a surrogate pair whole.
export function lastInitial(lastName: string | null | undefined): string {
  const first = Array.from((lastName ?? '').trim())[0];
  return first ? `${first.toUpperCase()}.` : '';
}

// A LIMITED caller's name: first name and last initial, else the masked phone.
export function limitedDisplayName(
  c: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null,
): string | null {
  if (!c) return null;
  const name = [c.firstName?.trim(), lastInitial(c.lastName)]
    .filter(Boolean)
    .join(' ');
  return name || maskPhone(c.phone);
}
