// One validator for every paginated list: null when the page is not a whole
// number inside range.
export function validPage(page, totalPages) {
  const target = Number(page);
  const last = Math.max(1, Number(totalPages) || 1);
  if (!Number.isInteger(target) || target < 1 || target > last) return null;
  return target;
}
