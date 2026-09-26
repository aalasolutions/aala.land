export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  AGENT: 'agent',
  ACCOUNTANT: 'accountant',
};

export function isAdminRole(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN].includes(role);
}

export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

export function canManageUsers(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN].includes(role);
}

export function canViewReports(role) {
  return [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER].includes(role);
}

export function canAccessWhatsapp(role) {
  return [
    ROLES.COMPANY_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.AGENT,
  ].includes(role);
}

export function canManageFinancials(role) {
  return [
    ROLES.SUPER_ADMIN,
    ROLES.COMPANY_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.ACCOUNTANT,
  ].includes(role);
}

// Roles that decide contact access requests; the backend approves with the same list.
const CONTACT_ACCESS_APPROVERS = [
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
];

export function canApproveContactAccess(role) {
  return CONTACT_ACCESS_APPROVERS.includes(role);
}

// The contacts list opens company-wide for these roles and on the active region for the rest.
export function listsAllRegionsByDefault(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(role);
}

// An explicit 'true' or 'false' query param wins; anything else takes the role default.
export function resolveAllRegions(value, role) {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return listsAllRegionsByDefault(role);
}

export const SIDEBAR_ROLES = {
  properties: [
    ROLES.COMPANY_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.AGENT,
    ROLES.ACCOUNTANT,
  ],
  documents: [
    ROLES.COMPANY_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.AGENT,
    ROLES.ACCOUNTANT,
  ],
  crm: [
    ROLES.COMPANY_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.AGENT,
    ROLES.ACCOUNTANT,
  ],
  finance: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  outreach: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  operations: [
    ROLES.COMPANY_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.ACCOUNTANT,
  ],
  reports: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  team: [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN],
  history: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  accessRequests: CONTACT_ACCESS_APPROVERS,
  admin: [ROLES.SUPER_ADMIN],
};

export const ROLE_HIERARCHY = [
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.AGENT,
  ROLES.ACCOUNTANT,
];

export function canUpdateUser(role, targetRole) {
  const currentRoleIndex = ROLE_HIERARCHY.indexOf(role);
  const targetRoleIndex = ROLE_HIERARCHY.indexOf(targetRole);

  const hasValidRoles = currentRoleIndex !== -1 && targetRoleIndex !== -1;

  if (!hasValidRoles) {
    return false;
  }

  return currentRoleIndex < targetRoleIndex;
}

// Adding or removing a region is a paid entitlement, so it stays with the owner.
export function canManageRegions(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(role);
}

export function getVisibleGroups(role) {
  const groups = {};
  if (!role) return groups;
  for (const [group, allowedRoles] of Object.entries(SIDEBAR_ROLES)) {
    groups[group] = allowedRoles.includes(role);
  }
  return groups;
}
