import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import { Role } from '@shared/enums/roles.enum';

export function requireCompanyId(user: JwtUserPayload): string {
  if (!user.companyId) {
    throw new ForbiddenException('This endpoint requires a company context');
  }
  return user.companyId;
}

/**
 * Resolve the company scope for a request. SUPER_ADMIN operates across all companies
 * (returns undefined); every other role MUST carry a company context, so a missing
 * companyId is rejected here rather than silently falling through to an unscoped,
 * cross-company operation. Use this anywhere the SUPER_ADMIN-is-unscoped rule applies;
 * use requireCompanyId when the operation is company-scoped for every role.
 */
export function scopedCompanyId(user: JwtUserPayload): string | undefined {
  if (user.role === Role.SUPER_ADMIN) return undefined;
  if (!user.companyId) {
    throw new BadRequestException('companyId is required');
  }
  return user.companyId;
}

export const ROLE_HIERARCHY: Role[] = [
  Role.SUPER_ADMIN,
  Role.COMPANY_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
  Role.AGENT,
  Role.ACCOUNTANT,
];

export function getRoleLevel(role: Role): number {
  const level = ROLE_HIERARCHY.indexOf(role);
  if (level === -1) throw new ForbiddenException(`Invalid role: ${role}`);
  return level;
}
