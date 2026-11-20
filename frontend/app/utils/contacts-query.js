import { localMidnightIso } from './local-date';
import { resolveAllRegions } from './roles';

// One query for the contacts list and its export, so the file always matches the page.
export function contactsListFilters(
  {
    allRegions = '',
    search = '',
    tag = '',
    agentId = '',
    isWhatsapp = '',
    company = '',
    companyExact = '',
    region = '',
    nationality = '',
    dateFrom = '',
    dateTo = '',
  },
  { role, regionService },
) {
  const params = {};
  if (resolveAllRegions(allRegions, role)) {
    params.allRegions = 'true';
  } else {
    const regionCode = region || regionService?.regionCode;
    if (regionCode) params.regionCode = regionCode;
  }
  if (search) params.search = search;
  if (tag) params.tag = tag;
  if (agentId) params.agentId = agentId;
  if (isWhatsapp) params.isWhatsapp = 'true';
  if (company) params.company = company;
  if (company && companyExact === 'true') params.companyExact = 'true';
  if (nationality) params.nationality = nationality;
  // Created-at days are the listed region's days; all-regions lists use the active region's day.
  const zone =
    regionService?.regions?.find((r) => r.code === region)?.timezone ??
    regionService?.activeRegion?.timezone;
  const fromIso = localMidnightIso(dateFrom, 0, zone);
  const toIso = localMidnightIso(dateTo, 1, zone);
  if (fromIso) params.dateFrom = fromIso;
  if (toIso) params.dateTo = toIso;
  return params;
}
