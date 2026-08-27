import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import {
  RegionScopeInterceptor,
  NO_REGION_SENTINEL,
} from './region-scope.interceptor';
import { Role } from '../enums/roles.enum';

describe('RegionScopeInterceptor', () => {
  let repo: { find: jest.Mock };
  let companyRepo: { findOne: jest.Mock };
  let interceptor: RegionScopeInterceptor;
  let next: CallHandler;

  // Mirrors Express 5: `query` is a getter that re-parses, so assigning a
  // property on the returned object is discarded.
  function expressFiveRequest(queryString: Record<string, string>, user: any) {
    const req: any = { user };
    Object.defineProperty(req, 'query', {
      get: () => ({ ...queryString }),
      configurable: true,
    });
    return req;
  }

  function contextFor(req: any): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    repo = { find: jest.fn() };
    companyRepo = {
      findOne: jest.fn().mockResolvedValue({ defaultRegionCode: 'makkah' }),
    };
    interceptor = new RegionScopeInterceptor(repo as any, companyRepo as any);
    next = { handle: jest.fn().mockReturnValue(of(null)) };
  });

  it('proves a naive assignment would not stick on Express 5', () => {
    const req = expressFiveRequest({ regionCode: 'makkah' }, null);
    req.query.regionCode = 'punjab';
    expect(req.query.regionCode).toBe('makkah');
  });

  it('rewrites a region the user is not assigned to', async () => {
    repo.find.mockResolvedValue([{ regionCode: 'punjab' }]);
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.AGENT },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('punjab');
  });

  it('keeps a region the user is assigned to', async () => {
    repo.find.mockResolvedValue([
      { regionCode: 'punjab' },
      { regionCode: 'makkah' },
    ]);
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.MANAGER },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('makkah');
  });

  it('fills in a region when the caller sends none', async () => {
    repo.find.mockResolvedValue([{ regionCode: 'punjab' }]);
    const req = expressFiveRequest({}, { userId: 'u1', role: Role.AGENT });

    await interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('punjab');
  });

  it('preserves other query params while rewriting', async () => {
    repo.find.mockResolvedValue([{ regionCode: 'punjab' }]);
    const req = expressFiveRequest(
      { regionCode: 'makkah', page: '2', search: 'ahmed' },
      { userId: 'u1', role: Role.AGENT },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(req.query).toMatchObject({
      regionCode: 'punjab',
      page: '2',
      search: 'ahmed',
    });
  });

  it('leaves admins untouched so they keep reading every region', async () => {
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.COMPANY_ADMIN },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(repo.find).not.toHaveBeenCalled();
    expect(req.query.regionCode).toBe('makkah');
  });

  it('leaves unauthenticated requests untouched', async () => {
    const req = expressFiveRequest({ regionCode: 'makkah' }, undefined);

    await interceptor.intercept(contextFor(req), next);

    expect(repo.find).not.toHaveBeenCalled();
  });

  // A user with no assignments must not fall through unscoped, or every freshly
  // created member would be a hole in the region boundary.
  it('pins an unassigned user to the company default rather than letting them through', async () => {
    repo.find.mockResolvedValue([]);
    const req = expressFiveRequest(
      { regionCode: 'punjab' },
      { userId: 'u1', role: Role.AGENT, companyId: 'c1' },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('makkah');
    expect(next.handle).toHaveBeenCalled();
  });


  it('scrubs the region to a sentinel when the company has no default', async () => {
    repo.find.mockResolvedValue([]);
    companyRepo.findOne.mockResolvedValue({ defaultRegionCode: null });
    const req = expressFiveRequest(
      { regionCode: 'punjab' },
      { userId: 'u1', role: Role.AGENT, companyId: 'c1' },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe(NO_REGION_SENTINEL);
    expect(req.query.regionCode).not.toBe('punjab');
    expect(next.handle).toHaveBeenCalled();
  });

  it('uses a truthy sentinel that matches no real region code', () => {
    expect(NO_REGION_SENTINEL).toBeTruthy();
    expect(NO_REGION_SENTINEL).not.toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('scrubs even when the user has no company at all', async () => {
    repo.find.mockResolvedValue([]);
    const req = expressFiveRequest(
      { regionCode: 'punjab' },
      { userId: 'u1', role: Role.AGENT, companyId: null },
    );

    await interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe(NO_REGION_SENTINEL);
  });
});
