import { ROLES } from 'land/utils/roles';

// Mirrors TRANSFER_TIERS in backend/src/modules/data-transfer/data-transfer.service.ts; change both together.
export const TRANSFER_TIERS = {
  import: ['PRO', 'ENTERPRISE'],
  export: ['PRO', 'ENTERPRISE'],
};

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
