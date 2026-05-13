import { ForbiddenException } from '@nestjs/common';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';
import { Role } from '@shared/enums/roles.enum';

export function requireCompanyId(user: JwtUserPayload): string {
  if (!user.companyId) {
    throw new ForbiddenException('This endpoint requires a company context');
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
