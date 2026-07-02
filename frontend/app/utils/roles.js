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

export function canManageUsers(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN].includes(role);
}

export function canAccessWhatsapp(role) {
  return [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT].includes(role);
}

export function canManageFinancials(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT].includes(role);
}

export function canDelete(role) {
  return [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(role);
}

export const SIDEBAR_ROLES = {
  properties: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.ACCOUNTANT],
  documents: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.ACCOUNTANT],
  crm: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.ACCOUNTANT],
  finance: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  outreach: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  operations: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  reports: [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.AGENT, ROLES.ACCOUNTANT],
  team: [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN],
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

  const hasValidRoles =
    currentRoleIndex !== -1 &&
    targetRoleIndex !== -1;

  if (!hasValidRoles) {
    return false;
  }

  return currentRoleIndex < targetRoleIndex;
}

export function canSwitchRegion(role) {
  return role === ROLES.COMPANY_ADMIN;
}

export function getVisibleGroups(role) {
  const groups = {};
  if (!role) return groups;
  for (const [group, allowedRoles] of Object.entries(SIDEBAR_ROLES)) {
    groups[group] = allowedRoles.includes(role);
  }
  return groups;
}
