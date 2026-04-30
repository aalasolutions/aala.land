export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  AGENT: 'agent',
  VIEWER: 'viewer',
};

export function isAdminRole(role) {
  return role === ROLES.COMPANY_ADMIN || role === ROLES.SUPER_ADMIN;
}
