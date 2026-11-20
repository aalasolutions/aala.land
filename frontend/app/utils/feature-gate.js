import { ROLES } from 'land/utils/roles';

// Mirrors TRANSFER_TIERS in backend/src/shared/utils/transfer-tiers.ts; change both together.
export const TRANSFER_TIERS = {
  import: ['PRO', 'ENTERPRISE'],
  export: ['PRO', 'ENTERPRISE'],
};

const TIER_LABELS = { PRO: 'Pro', ENTERPRISE: 'Enterprise' };

// The plan sentence shown wherever a transfer control is locked, derived from the tier list.
export function tierSentence(kind) {
  const names = TRANSFER_TIERS[kind].map((tier) => TIER_LABELS[tier] ?? tier);
  const plans = names.length > 1 ? 'plans' : 'plan';
  return `This feature is on the ${names.join(' and ')} ${plans}.`;
}

function authenticated(session) {
  return session?.data?.authenticated ?? null;
}

// Import and export belong to the company admin; other roles never see the controls.
export function isTransferAdmin(session) {
  return authenticated(session)?.user?.role === ROLES.COMPANY_ADMIN;
}

function allowed(kind, session) {
  const auth = authenticated(session);
  return (
    isTransferAdmin(session) &&
    TRANSFER_TIERS[kind].includes(auth?.subscriptionTier)
  );
}

export function canImport(session) {
  return allowed('import', session);
}

export function canExport(session) {
  return allowed('export', session);
}
