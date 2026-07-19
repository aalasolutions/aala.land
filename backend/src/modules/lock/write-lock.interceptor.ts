import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Role } from '@shared/enums/roles.enum';
import { LockStateService } from './lock-state.service';

/** HTTP 423 Locked. */
const HTTP_LOCKED = 423;

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Paths a write-locked tenant may still write to: they must be able to
 * authenticate and to PAY their way out. Matched against the /v1-stripped path.
 */
const LOCK_EXEMPT_PREFIXES = ['auth', 'billing'];

export const LOCKED_MESSAGE =
  'You are over your limits. Reduce or pay to continue. ' +
  'Your data is safe and stays readable and exportable.';

/**
 * Ratified lock scope (design section 8): WRITE LOCK. Reads and export stay.
 * Registered as a global interceptor (not a guard) because req.user is only
 * populated after the controller-level JwtAuthGuard has run; interceptors
 * execute after all guards. Read-time evaluation, no scheduler: the lock
 * appears when the deal's until-date passes and disappears when a lift, a
 * covering manual payment, a new deal, or a live card subscription lands.
 */
@Injectable()
export class WriteLockInterceptor implements NestInterceptor {
  constructor(private readonly lockState: LockStateService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      path?: string;
      url?: string;
      user?: { companyId?: string | null; role?: string };
    }>();

    if (!WRITE_METHODS.includes(request.method)) return next.handle();

    const user = request.user;
    // No tenant context (public routes, webhooks) or the operator: never locked.
    if (!user?.companyId || user.role === Role.SUPER_ADMIN) {
      return next.handle();
    }

    const rawPath: string = request.path || request.url || '';
    const path = rawPath.replace(/^\/v1\//, '').replace(/^\/+/, '');
    if (LOCK_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    const state = await this.lockState.getLockState(user.companyId);
    if (state.locked) {
      throw new HttpException(
        {
          message: LOCKED_MESSAGE,
          error: 'Locked',
          code: 'COMPANY_LOCKED',
          statusCode: HTTP_LOCKED,
        },
        HTTP_LOCKED,
      );
    }
    return next.handle();
  }
}
