import { Role } from '../enums/roles.enum';

// ADMIN is deliberately absent: limited to assigned regions, unlike the company owner
const ALL_REGION_ROLES: string[] = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN];

// Not about region: reading NULL-region global rows like billing, filing company-wide docs
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

// Scoped to assignments, not the active regionCode filter; null means all regions
export function scopedRegionCodes(caller?: RegionScope): string[] | null {
  if (!caller || seesAllRegions(caller.role)) {
    return null;
  }
  return caller.regionCodes ?? [];
}

// Caller's assignments narrowed by the requested region; null reads all, empty reads none
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
