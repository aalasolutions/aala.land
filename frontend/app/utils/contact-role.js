// Open lead first, then active tenancy, then owned units; null when none apply.
export function primaryRole({ totals } = {}) {
  if (totals?.openLeads) return 'lead';
  if (totals?.activeLeases) return 'tenant';
  if (totals?.units) return 'owner';
  return null;
}
