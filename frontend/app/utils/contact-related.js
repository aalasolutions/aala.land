export const RELATED_PAGE_SIZE = 50;

const LIST_PATH = {
  leads: (id) => `/leads?contactId=${id}`,
  leases: (id) => `/leases?contactId=${id}&archived=include`,
  properties: (id) => `/properties/units?ownerId=${id}`,
};

// One page of a contact's related list, as shown in its detail tab.
export function relatedListUrl(tab, contactId, page = 1) {
  return `${LIST_PATH[tab](contactId)}&page=${page}&limit=${RELATED_PAGE_SIZE}`;
}
