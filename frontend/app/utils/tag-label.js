import {
  ACCESS_LEVEL_SHORT_LABELS,
  ALL_ROLES,
  CATEGORIES,
  CHEQUE_TYPE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  EMAIL_CATEGORIES,
  FILTER_STATUS_OPTIONS,
  HISTORY_ACTIONS,
  LEAD_STATUS_OPTIONS,
  LEASE_STATUS_OPTIONS,
  LEASE_TYPE_OPTIONS,
  MAINTENANCE_CATEGORY_OPTIONS,
  MAINTENANCE_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PRIORITY_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_SUB_TYPES,
  PROPERTY_TYPE_OPTIONS,
  SPECIALTY_OPTIONS,
  TEMPERATURE_OPTIONS,
  TRANSACTION_CATEGORY_OPTIONS,
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
} from 'land/constants';
import { CONTACT_TAG_LABELS } from 'land/helpers/contact-tag-label';
import { ACCESS_STATUS_OPTIONS } from 'land/utils/access-requests';

// Same domains as utils/tag-variant.js; on a shared key the first source wins.
const SOURCES = {
  lead: [LEAD_STATUS_OPTIONS],
  temp: [TEMPERATURE_OPTIONS],
  txn: [TRANSACTION_STATUS_OPTIONS],
  commission: [FILTER_STATUS_OPTIONS],
  unit: [PROPERTY_STATUS_OPTIONS],
  proptype: [PROPERTY_TYPE_OPTIONS, PROPERTY_SUB_TYPES],
  wo: [MAINTENANCE_STATUS_OPTIONS],
  priority: [PRIORITY_OPTIONS],
  trade: [SPECIALTY_OPTIONS, MAINTENANCE_CATEGORY_OPTIONS],
  cheque: [CHEQUE_TYPE_OPTIONS],
  txntype: [TRANSACTION_TYPE_OPTIONS],
  txncat: [TRANSACTION_CATEGORY_OPTIONS],
  payment: [PAYMENT_METHOD_OPTIONS],
  commtype: [COMMISSION_TYPE_OPTIONS],
  contact: [
    Object.entries(CONTACT_TAG_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ],
  doc: [CATEGORIES],
  access: [ACCESS_LEVEL_SHORT_LABELS],
  email: [EMAIL_CATEGORIES],
  lease: [LEASE_TYPE_OPTIONS, LEASE_STATUS_OPTIONS],
  role: [ALL_ROLES],
  historyAction: [HISTORY_ACTIONS],
  accessRequest: [ACCESS_STATUS_OPTIONS],
};

const LABELS = Object.fromEntries(
  Object.entries(SOURCES).map(([domain, lists]) => {
    const map = new Map();
    for (const option of lists.flat()) {
      const key = String(option.value ?? option.id ?? '').toLowerCase();
      if (key && !map.has(key)) map.set(key, option.label);
    }
    return [domain, map];
  }),
);

function titleCase(value) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function tagLabel(domain, value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  const labels = Object.hasOwn(LABELS, domain) ? LABELS[domain] : null;
  return labels?.get(text.toLowerCase()) ?? titleCase(text);
}

export default tagLabel;
