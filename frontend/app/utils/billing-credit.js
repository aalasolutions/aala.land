export function creditDisplayAmount(row) {
  const applied = row?.creditApplied ?? 0;
  const issued = row?.creditIssued ?? 0;
  if (applied > 0) return applied;
  return issued > 0 ? issued : 0;
}
