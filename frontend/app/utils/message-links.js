// Only web links become clickable; javascript:, data: and every other scheme stays plain text.
// The prefix group stands in for a lookbehind, which older iOS webviews cannot parse; _ allows _italic_ links.
const LINK_PATTERN = /(^|[^\w.@]|_)((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi;
const TRAILING_PUNCTUATION_CHARS = new Set([
  '.',
  ',',
  '!',
  '?',
  ';',
  ':',
  "'",
  '"',
  '*',
  '_',
  '~',
  ']',
]);
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// A closing bracket belongs to the link only while it balances one the link opened.
// Parens are counted once up front so trimming a long run of ")" stays linear, not quadratic.
function trimTrailing(candidate) {
  let openCount = 0;
  let closeCount = 0;
  for (let i = 0; i < candidate.length; i++) {
    if (candidate[i] === '(') openCount++;
    else if (candidate[i] === ')') closeCount++;
  }
  let end = candidate.length;
  while (end > 0 && TRAILING_PUNCTUATION_CHARS.has(candidate[end - 1])) {
    end--;
  }
  while (end > 0 && candidate[end - 1] === ')' && closeCount > openCount) {
    end--;
    closeCount--;
    while (end > 0 && TRAILING_PUNCTUATION_CHARS.has(candidate[end - 1])) {
      end--;
    }
  }
  return candidate.slice(0, end);
}

function toSafeUrl(raw) {
  try {
    const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
    return ALLOWED_PROTOCOLS.has(url.protocol) && url.hostname ? url : null;
  } catch {
    return null;
  }
}

// Splits message text into plain text and link parts; the text itself is never turned into HTML.
export function splitMessageLinks(text) {
  const parts = [];
  if (!text) return parts;
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index + match[1].length;
    const label = trimTrailing(match[2]);
    const url = toSafeUrl(label);
    if (!url) continue;
    if (start > cursor) {
      parts.push({ isLink: false, value: text.slice(cursor, start) });
    }
    // hostname is punycode for lookalike domains, so the confirm and tooltip name the real target.
    parts.push({
      isLink: true,
      value: label,
      href: url.href,
      host: url.hostname,
    });
    cursor = start + label.length;
  }
  if (cursor < text.length) {
    parts.push({ isLink: false, value: text.slice(cursor) });
  }
  return parts;
}
