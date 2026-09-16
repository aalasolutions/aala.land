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
