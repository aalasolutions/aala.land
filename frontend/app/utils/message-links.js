// Only web links become clickable; javascript:, data: and every other scheme stays plain text.
// The prefix group stands in for a lookbehind, which older iOS webviews cannot parse.
const LINK_PATTERN = /(^|[^\w.@])((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi;
const TRAILING_PUNCTUATION = /[.,!?;:'"*_~\]]+$/;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function countOf(text, char) {
  return text.split(char).length - 1;
}

// A closing bracket belongs to the link only while it balances one the link opened.
function trimTrailing(candidate) {
  let url = candidate.replace(TRAILING_PUNCTUATION, '');
  while (url.endsWith(')') && countOf(url, ')') > countOf(url, '(')) {
    url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
  return url;
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
