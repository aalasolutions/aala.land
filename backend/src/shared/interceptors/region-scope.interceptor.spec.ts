import { Observable, of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import {
  RegionScopeInterceptor,
  NO_REGION_SENTINEL,
} from './region-scope.interceptor';
import { Role } from '../enums/roles.enum';

describe('RegionScopeInterceptor', () => {
  let interceptor: RegionScopeInterceptor;
  let next: CallHandler;

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
    interceptor = new RegionScopeInterceptor();
    next = { handle: jest.fn().mockReturnValue(of(null)) };
  });

  it('rewrites a region the user is not assigned to', () => {
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.AGENT, regionCodes: ['punjab'] },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('punjab');
  });

  it('keeps a region the user is assigned to', () => {
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.MANAGER, regionCodes: ['punjab', 'makkah'] },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('makkah');
  });

  it('fills in a region when the caller sends none', () => {
    const req = expressFiveRequest(
      {},
      { userId: 'u1', role: Role.AGENT, regionCodes: ['punjab'] },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('punjab');
  });

  it('preserves other query params while rewriting', () => {
    const req = expressFiveRequest(
      { regionCode: 'makkah', page: '2', search: 'ahmed' },
      { userId: 'u1', role: Role.AGENT, regionCodes: ['punjab'] },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query).toMatchObject({
      regionCode: 'punjab',
      page: '2',
      search: 'ahmed',
    });
  });

  it('leaves admins untouched so they keep reading every region', () => {
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.COMPANY_ADMIN, regionCodes: ['punjab'] },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('makkah');
  });

  it('leaves unauthenticated requests untouched', () => {
    const req = expressFiveRequest({ regionCode: 'makkah' }, undefined);

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe('makkah');
    expect(next.handle).toHaveBeenCalled();
  });

  it('scrubs an unassigned user to the sentinel, not the company default', () => {
    const req = expressFiveRequest(
      { regionCode: 'punjab' },
      { userId: 'u1', role: Role.AGENT, companyId: 'c1', regionCodes: [] },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe(NO_REGION_SENTINEL);
    expect(next.handle).toHaveBeenCalled();
  });

  it('scrubs when regionCodes is missing from the token payload', () => {
    const req = expressFiveRequest(
      { regionCode: 'punjab' },
      { userId: 'u1', role: Role.AGENT, companyId: 'c1' },
    );

    interceptor.intercept(contextFor(req), next);

    expect(req.query.regionCode).toBe(NO_REGION_SENTINEL);
  });

  it('returns the handler stream synchronously', () => {
    const req = expressFiveRequest(
      { regionCode: 'makkah' },
      { userId: 'u1', role: Role.AGENT, regionCodes: ['punjab'] },
    );

    const result = interceptor.intercept(contextFor(req), next);

    expect(result).toBeInstanceOf(Observable);
  });
});
