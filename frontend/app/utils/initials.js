// Array.from splits by code point, so an emoji-led word yields the whole emoji, not half a surrogate pair.
export function initialsOf(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0]);
  return letters.join('').toUpperCase();
}
