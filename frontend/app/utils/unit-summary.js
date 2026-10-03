// Lease and work-order reads carry only unitId, so the unit read supplies the link and label.
export async function fetchUnitSummary(auth, unitId) {
  if (!unitId) return null;
  const json = await auth
    .fetchJson(`/properties/units/${unitId}`)
    .catch(() => null);
  const unit = json?.data;
  if (!unit?.id) return null;
  const label = [unit.asset?.name, unit.unitNumber].filter(Boolean).join(' - ');
  return {
    id: unit.id,
    areaId: unit.asset?.localityId ?? unit.asset?.locality?.id ?? null,
    label: label || 'Unit',
  };
}
