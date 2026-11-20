import type { ContactFilters } from './contacts.service';

// The query-string shape the list and the export share; flags arrive as 'true' or 'false'.
export interface ContactFilterQuery {
  agentId?: string;
  isWhatsapp?: string;
  company?: string;
  companyExact?: string;
  nationality?: string;
  regionCode?: string;
  dateFrom?: string;
  dateTo?: string;
  allRegions?: string;
}

export function toContactFilters(query: ContactFilterQuery): ContactFilters {
  return {
    agentId: query.agentId || undefined,
    isWhatsapp: query.isWhatsapp ? query.isWhatsapp === 'true' : undefined,
    company: query.company || undefined,
    companyExact: query.companyExact === 'true',
    nationality: query.nationality || undefined,
    regionCode: query.regionCode || undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    allRegions: query.allRegions === 'true',
  };
}
