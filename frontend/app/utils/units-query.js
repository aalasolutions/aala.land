// One query for the properties browse list and its export, so the file always matches the page.
export function unitsListFilters(
  {
    archivedFilterValue = 'exclude',
    filterType = '',
    filterStatus = '',
    filterBeds = '',
    filterMinPrice = '',
    filterMaxPrice = '',
    filterAmenities = [],
  },
  { regionCode } = {},
) {
  const params = {};
  if (regionCode) params.regionCode = regionCode;
  if (archivedFilterValue !== 'exclude') params.archived = archivedFilterValue;
  if (filterType) params.propertyType = filterType;
  if (filterStatus) params.status = filterStatus;
  if (filterMinPrice) params.minPrice = filterMinPrice;
  if (filterMaxPrice) params.maxPrice = filterMaxPrice;
  // The 4+ option sends 4 to 99 bedrooms; every other option is one exact count.
  if (filterBeds) {
    params.minBeds = filterBeds;
    params.maxBeds = filterBeds === '4' ? '99' : filterBeds;
  }
  if (filterAmenities.length) params.amenities = filterAmenities.join(',');
  return params;
}
