import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { seesAllRegions } from '../utils/region-visibility.util';

export const NO_REGION_SENTINEL = '__no_region__';

@Injectable()
export class RegionScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // seesAllRegions already encodes admin visibility, so those requests skip scoping
    if (!user?.userId || seesAllRegions(user.role)) {
      return next.handle();
    }

    const requested = request.query?.regionCode as string | undefined;
    const codes: string[] = user.regionCodes ?? [];

    // No assignment means no access.
    if (codes.length === 0) {
      this.overwriteRegionCode(request, NO_REGION_SENTINEL);
      return next.handle();
    }

    const effective =
      requested && codes.includes(requested) ? requested : codes[0];

    this.overwriteRegionCode(request, effective);
    return next.handle();
  }

  // Express 5's req.query getter re-parses on access; a direct assignment is silently discarded
  private overwriteRegionCode(request: any, regionCode: string): void {
    const current = { ...(request.query ?? {}) };
    current.regionCode = regionCode;
    Object.defineProperty(request, 'query', {
      value: current,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }
}
