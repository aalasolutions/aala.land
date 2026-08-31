import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { Company } from '../companies/entities/company.entity';
import { NO_REGION_SENTINEL } from '@shared/interceptors/region-scope.interceptor';

const LEASE_ID = '123e4567-e89b-12d3-a456-426614174010';
const COMPANY_ID = '123e4567-e89b-12d3-a456-426614174001';
const USER_ID = '123e4567-e89b-12d3-a456-426614174002';

function ctxFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function handlerFor(responseData: unknown): CallHandler {
  return { handle: () => of(responseData) };
}

// The interceptor writes the audit row fire-and-forget after the response is
// emitted, so the pending promise chain has to drain before asserting.
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('AuditInterceptor region attribution', () => {
  let auditLogRepository: { create: jest.Mock; save: jest.Mock };
  let companyRepository: { findOne: jest.Mock };
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    auditLogRepository = {
      create: jest.fn((row: Partial<AuditLog>) => row),
      save: jest.fn((row: Partial<AuditLog>) => Promise.resolve(row)),
    };
    companyRepository = {
      findOne: jest.fn().mockResolvedValue({ defaultRegionCode: 'makkah' }),
    };
    const service = new AuditService(
      auditLogRepository as unknown as Repository<AuditLog>,
      companyRepository as unknown as Repository<Company>,
    );
    interceptor = new AuditInterceptor(service);
  });

  async function run(
    request: Record<string, unknown>,
    responseData: unknown,
  ): Promise<Partial<AuditLog>> {
    await lastValueFrom(
      interceptor.intercept(ctxFor(request), handlerFor(responseData)),
    );
    await flush();
    expect(auditLogRepository.save).toHaveBeenCalledTimes(1);
    return auditLogRepository.save.mock.calls[0][0] as Partial<AuditLog>;
  }

  it('stamps the region of the entity an admin acted on, not the company default', async () => {
    const row = await run(
      {
        method: 'PATCH',
        path: `/v1/leads/${LEASE_ID}`,
        headers: {},
        query: {},
        body: { status: 'WON' },
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'company_admin' },
      },
      { data: { id: LEASE_ID, regionCode: 'punjab' } },
    );

    expect(row.regionCode).toBe('punjab');
    expect(row.regionCode).not.toBe('makkah');
    expect(companyRepository.findOne).not.toHaveBeenCalled();
  });

  it('leaves the region NULL when an admin acts on an entity that exposes none', async () => {
    const row = await run(
      {
        method: 'POST',
        path: `/v1/leases/${LEASE_ID}/terminate`,
        headers: {},
        query: {},
        body: {},
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'company_admin' },
      },
      { data: { id: LEASE_ID, status: 'TERMINATED' } },
    );

    expect(row.regionCode).toBeNull();
    expect(row.regionCode).not.toBe('makkah');
    expect(companyRepository.findOne).not.toHaveBeenCalled();
  });

  it('keeps the region a scoped role is pinned to when the entity exposes none', async () => {
    const row = await run(
      {
        method: 'POST',
        path: `/v1/leases/${LEASE_ID}/terminate`,
        headers: {},
        query: { regionCode: 'punjab' },
        body: {},
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'manager' },
      },
      { data: { id: LEASE_ID, status: 'TERMINATED' } },
    );

    expect(row.regionCode).toBe('punjab');
    expect(companyRepository.findOne).not.toHaveBeenCalled();
  });

  it('prefers the acted-on entity region over the region on the request', async () => {
    const row = await run(
      {
        method: 'PATCH',
        path: `/v1/leads/${LEASE_ID}`,
        headers: {},
        query: { regionCode: 'makkah' },
        body: { status: 'WON' },
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'company_admin' },
      },
      { data: { id: LEASE_ID, regionCode: 'punjab' } },
    );

    expect(row.regionCode).toBe('punjab');
  });

  it('never writes the no-region sentinel as a region', async () => {
    const row = await run(
      {
        method: 'POST',
        path: '/v1/leads',
        headers: {},
        query: { regionCode: NO_REGION_SENTINEL },
        body: { firstName: 'Test' },
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'manager' },
      },
      { data: { id: LEASE_ID } },
    );

    expect(row.regionCode).not.toBe(NO_REGION_SENTINEL);
    expect(row.regionCode).toBe('makkah');
  });

  it('keeps billing global with a NULL region', async () => {
    const row = await run(
      {
        method: 'POST',
        path: '/v1/billing/checkout',
        headers: {},
        query: { regionCode: 'punjab' },
        body: { tier: 'PRO' },
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'company_admin' },
      },
      { data: { id: LEASE_ID } },
    );

    expect(row.regionCode).toBeNull();
    expect(companyRepository.findOne).not.toHaveBeenCalled();
  });

  it('still falls back to the company default when there is no user context (login)', async () => {
    const row = await run(
      {
        method: 'POST',
        path: '/v1/auth/login',
        headers: {},
        query: {},
        body: { email: 'user@example.com', password: 'secret' },
      },
      { data: { user: { id: USER_ID, companyId: COMPANY_ID } } },
    );

    expect(row.regionCode).toBe('makkah');
    expect(companyRepository.findOne).toHaveBeenCalledTimes(1);
  });
});
