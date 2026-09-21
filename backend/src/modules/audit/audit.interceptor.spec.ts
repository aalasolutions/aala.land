import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { DataSource, Repository } from 'typeorm';
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

// The audit row is written fire-and-forget, so the promise chain must drain before asserting.
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

  it.each([
    ['/v1/properties/units/:id/delete', 'DELETE', 'delete'],
    ['/v1/properties/assets/:id/delete', 'DELETE', 'delete'],
    ['/v1/users/:id/delete', 'DELETE', 'delete'],
    ['/v1/properties/units/:id/archive', 'UPDATE', 'archive'],
    ['/v1/leases/:id/unarchive', 'UPDATE', 'unarchive'],
  ])(
    'POST %s logs %s with the path entity id',
    async (template, expectedAction, subAction) => {
      const row = await run(
        {
          method: 'POST',
          path: template.replace(':id', LEASE_ID),
          headers: {},
          query: {},
          body: { reason: 'Duplicate' },
          user: {
            userId: USER_ID,
            companyId: COMPANY_ID,
            role: 'company_admin',
          },
        },
        { data: { id: 'response-id' } },
      );

      expect(row.action).toBe(expectedAction);
      expect(row.entityId).toBe(LEASE_ID);
      expect(row.newValue).toEqual({ reason: 'Duplicate', _action: subAction });
    },
  );
});

describe('AuditInterceptor old value capture', () => {
  const TX_ID = '123e4567-e89b-12d3-a456-426614174020';
  const PREVIOUS = {
    status: 'PENDING',
    amount: '250.00',
    transactionDate: '2026-08-01',
  };

  let auditLogRepository: { create: jest.Mock; save: jest.Mock };
  let companyRepository: { findOne: jest.Mock };
  let dataSource: { isInitialized: boolean; query: jest.Mock };
  let order: string[];

  function build(): AuditInterceptor {
    const service = new AuditService(
      auditLogRepository as unknown as Repository<AuditLog>,
      companyRepository as unknown as Repository<Company>,
    );
    return new AuditInterceptor(service, dataSource as unknown as DataSource);
  }

  function orderedHandler(responseData: unknown): CallHandler {
    return {
      handle: () => {
        order.push('handler');
        return of(responseData);
      },
    };
  }

  async function run(
    request: Record<string, unknown>,
    responseData: unknown,
    interceptor: AuditInterceptor = build(),
  ): Promise<Partial<AuditLog>> {
    await lastValueFrom(
      interceptor.intercept(ctxFor(request), orderedHandler(responseData)),
    );
    await flush();
    expect(auditLogRepository.save).toHaveBeenCalledTimes(1);
    return auditLogRepository.save.mock.calls[0][0] as Partial<AuditLog>;
  }

  function patchTransaction(id: string = TX_ID): Record<string, unknown> {
    return {
      method: 'PATCH',
      path: `/v1/financial/transactions/${id}`,
      headers: {},
      query: {},
      body: { status: 'COMPLETED' },
      user: { userId: USER_ID, companyId: COMPANY_ID, role: 'company_admin' },
    };
  }

  beforeEach(() => {
    order = [];
    auditLogRepository = {
      create: jest.fn((row: Partial<AuditLog>) => row),
      save: jest.fn((row: Partial<AuditLog>) => Promise.resolve(row)),
    };
    companyRepository = {
      findOne: jest.fn().mockResolvedValue({ defaultRegionCode: 'makkah' }),
    };
    dataSource = {
      isInitialized: true,
      query: jest.fn(() => {
        order.push('pre-read');
        return Promise.resolve([{ ...PREVIOUS }]);
      }),
    };
  });

  it('records the previous transaction state as oldValue', async () => {
    const row = await run(patchTransaction(), {
      data: { id: TX_ID, status: 'COMPLETED' },
    });

    expect(row.oldValue).toEqual(PREVIOUS);
    expect(row.newValue).toEqual({ status: 'COMPLETED' });
  });

  it('reads the previous state before the handler mutates the row', async () => {
    await run(patchTransaction(), { data: { id: TX_ID } });

    expect(order).toEqual(['pre-read', 'handler']);
  });

  it('scopes the pre-read to the entity id and the company', async () => {
    await run(patchTransaction(), { data: { id: TX_ID } });

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [sql, params] = dataSource.query.mock.calls[0] as [string, string[]];
    expect(sql).toContain('FROM "transactions"');
    expect(sql).toContain('"company_id" = $2');
    expect(params).toEqual([TX_ID, COMPANY_ID]);
  });

  it('never pre-reads an entity type that has not opted in', async () => {
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

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(row.oldValue).toBeUndefined();
  });

  it('never pre-reads on create, where there is no previous state', async () => {
    const row = await run(
      {
        method: 'POST',
        path: '/v1/financial/transactions',
        headers: {},
        query: {},
        body: { amount: 250 },
        user: { userId: USER_ID, companyId: COMPANY_ID, role: 'company_admin' },
      },
      { data: { id: TX_ID } },
    );

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(row.oldValue).toBeUndefined();
  });

  it('still logs when the entity no longer exists', async () => {
    dataSource.query = jest.fn().mockResolvedValue([]);

    const row = await run(patchTransaction(), { data: { id: TX_ID } });

    expect(row.oldValue).toBeUndefined();
    expect(row.action).toBe('UPDATE');
  });

  it('does not fail the request when the pre-read throws', async () => {
    dataSource.query = jest
      .fn()
      .mockRejectedValue(new Error('connection lost'));

    const row = await run(patchTransaction(), { data: { id: TX_ID } });

    expect(row.oldValue).toBeUndefined();
    expect(row.entityId).toBe(TX_ID);
  });

  it('skips the pre-read when the path carries no uuid', async () => {
    const request = patchTransaction();
    request.path = '/v1/financial/transactions/not-a-uuid';

    const row = await run(request, { data: { id: TX_ID } });

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(row.oldValue).toBeUndefined();
  });

  it('skips the pre-read when the data source is not initialized', async () => {
    dataSource.isInitialized = false;

    const row = await run(patchTransaction(), { data: { id: TX_ID } });

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(row.oldValue).toBeUndefined();
  });

  it('works when no data source is injected at all', async () => {
    const service = new AuditService(
      auditLogRepository as unknown as Repository<AuditLog>,
      companyRepository as unknown as Repository<Company>,
    );

    const row = await run(
      patchTransaction(),
      { data: { id: TX_ID } },
      new AuditInterceptor(service),
    );

    expect(row.oldValue).toBeUndefined();
    expect(row.entityId).toBe(TX_ID);
  });
});
