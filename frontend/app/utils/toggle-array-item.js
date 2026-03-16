/**
 * Toggles an item in an array - adds if not present, removes if present
 * Returns a new array (immutable, safe for tracked properties)
 * @param {string[]} array - Current array
 * @param {string} item - Item to toggle
 * @returns {string[]} - New array with item toggled
 */
export function toggleArrayItem(array, item) {
  const current = [...array];
  const idx = current.indexOf(item);
  if (idx === -1) {
    current.push(item);
  } else {
    current.splice(idx, 1);
  }
  return current;
}
