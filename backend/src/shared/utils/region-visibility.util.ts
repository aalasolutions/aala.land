import { Role } from '../enums/roles.enum';

// Admin roles read across every region; a NULL region_code marks a row as
// global (billing), which therefore also stays admin-only. Everyone else is
// confined to the region they are currently working in.
const ALL_REGION_ROLES: string[] = [
  Role.SUPER_ADMIN,
  Role.COMPANY_ADMIN,
  Role.ADMIN,
];

export function seesAllRegions(userRole: string): boolean {
  return ALL_REGION_ROLES.includes(userRole);
}
