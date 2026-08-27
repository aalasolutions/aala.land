import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { UserRegion } from '../../modules/users/entities/user-region.entity';
import { Company } from '../../modules/companies/entities/company.entity';
import { seesAllRegions } from '../utils/region-visibility.util';

export const NO_REGION_SENTINEL = '__no_region__';

// This rewrites it to a region the user is actually assigned to.
@Injectable()
export class RegionScopeInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(UserRegion)
    private readonly userRegionRepository: Repository<UserRegion>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Unauthenticated routes and admins are left alone; admins read every region
    // by design, which `seesAllRegions` already encodes for the query layer.
    if (!user?.userId || seesAllRegions(user.role)) {
      return next.handle();
    }

    const requested = request.query?.regionCode as string | undefined;
    const assigned = await this.userRegionRepository.find({
      where: { userId: user.userId },
      select: { regionCode: true },
    });

    // A user with no assignments must NOT fall through unscoped: that would make
    // every freshly created member a hole in the region boundary. Pin them to
    // their company default, and when the company has none, scrub the param to a
    // sentinel rather than leaving it caller-controlled.
    if (assigned.length === 0) {
      const fallback = await this.companyDefaultRegion(user.companyId);
      this.overwriteRegionCode(request, fallback ?? NO_REGION_SENTINEL);
      return next.handle();
    }

    const codes = assigned.map((row) => row.regionCode);
    const effective =
      requested && codes.includes(requested) ? requested : codes[0];

    this.overwriteRegionCode(request, effective);
    return next.handle();
  }

  private async companyDefaultRegion(
    companyId: string | null | undefined,
  ): Promise<string | null> {
    if (!companyId) return null;
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: { defaultRegionCode: true },
    });
    return company?.defaultRegionCode ?? null;
  }

  // Express 5 exposes `req.query` as a getter that re-parses the query string on
  // every access, so assigning `req.query.regionCode` is silently discarded.
  // The whole object has to be redefined for the rewrite to stick.
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
