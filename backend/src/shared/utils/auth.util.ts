import { ForbiddenException } from '@nestjs/common';
import { JwtUserPayload } from '@shared/interfaces/authenticated-request.interface';

export function requireCompanyId(user: JwtUserPayload): string {
  if (!user.companyId) {
    throw new ForbiddenException('This endpoint requires a company context');
  }
  return user.companyId;
}
