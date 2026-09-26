export const ACCESS_STATUS_VARIANTS = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  REVOKED: 'secondary',
};

export const ACCESS_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REVOKED', label: 'Revoked' },
];

const SOURCE_LABELS = { lead: 'Lead', unit: 'Unit', contact: 'Contact page' };

export function accessSourceLabel(sourceType) {
  return SOURCE_LABELS[sourceType] ?? '';
}

// A missing expiry means forever only on an approved grant; other rows never had one.
export function accessExpiryLabel(request) {
  if (request?.expiresAt) return '';
  return request?.status === 'APPROVED' ? 'Never' : '';
}
