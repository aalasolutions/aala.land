import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/roles.enum';
import { ROLE_FORBIDDEN_MESSAGE, RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function guardFor(required: Role[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  function contextFor(user: { role: string } | undefined): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('lets every caller through when the handler requires no role', () => {
    expect(
      guardFor(undefined).canActivate(contextFor({ role: Role.AGENT })),
    ).toBe(true);
    expect(guardFor([]).canActivate(contextFor({ role: Role.AGENT }))).toBe(
      true,
    );
  });

  it('lets a super admin through whatever the handler requires', () => {
    expect(
      guardFor([Role.COMPANY_ADMIN]).canActivate(
        contextFor({ role: Role.SUPER_ADMIN }),
      ),
    ).toBe(true);
  });

  it('lets a listed role through', () => {
    expect(
      guardFor([Role.COMPANY_ADMIN, Role.MANAGER]).canActivate(
        contextFor({ role: Role.MANAGER }),
      ),
    ).toBe(true);
  });

  it('refuses an unlisted role with the one-sentence message', () => {
    expect(() =>
      guardFor([Role.COMPANY_ADMIN]).canActivate(
        contextFor({ role: Role.AGENT }),
      ),
    ).toThrow(new ForbiddenException(ROLE_FORBIDDEN_MESSAGE));
  });

  it('refuses a request without a user the same way', () => {
    expect(() =>
      guardFor([Role.COMPANY_ADMIN]).canActivate(contextFor(undefined)),
    ).toThrow(new ForbiddenException(ROLE_FORBIDDEN_MESSAGE));
  });
});
