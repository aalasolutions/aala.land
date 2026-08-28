import { Role } from '../enums/roles.enum';

// Unconfined by region. ADMIN is deliberately absent: an admin is limited to
// the regions assigned to them, while the company owner is not.
const ALL_REGION_ROLES: string[] = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN];

// Admin privileges that are not about region: reading NULL-region global rows
// such as billing, and filing a company-wide document.
const ADMIN_ROLES: string[] = [
  Role.SUPER_ADMIN,
  Role.COMPANY_ADMIN,
  Role.ADMIN,
];

// The caller's role and assigned regions, as carried on the JWT payload.
export interface RegionScope {
  role: string;
  regionCodes: string[];
}

export function seesAllRegions(userRole: string): boolean {
  return ALL_REGION_ROLES.includes(userRole);
}

export function isAdminRole(userRole: string): boolean {
  return ADMIN_ROLES.includes(userRole);
}

// Regions the caller may read, or null when they read all of them. Scoped to
// assignments, not the active regionCode filter.
export function scopedRegionCodes(caller?: RegionScope): string[] | null {
  if (!caller || seesAllRegions(caller.role)) {
    return null;
  }
  return caller.regionCodes ?? [];
}

// The caller's assignments narrowed by the region they asked for. Null reads
// every region, an empty array reads none.
export function effectiveRegionCodes(
  regionCode?: string,
  caller?: RegionScope,
): string[] | null {
  const scoped = scopedRegionCodes(caller);
  if (!scoped) {
    return regionCode ? [regionCode] : null;
  }
  return regionCode ? scoped.filter((code) => code === regionCode) : scoped;
}
