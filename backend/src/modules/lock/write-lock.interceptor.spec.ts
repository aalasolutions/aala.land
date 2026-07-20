import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { WriteLockInterceptor } from './write-lock.interceptor';
import { LockStateService, UNLOCKED } from './lock-state.service';

const LOCKED_STATE = {
  locked: true,
  lifted: false,
  liftUntil: null,
  dealExpiredAt: '2026-06-30T00:00:00.000Z',
};

function ctxFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('WriteLockInterceptor', () => {
  let lockState: { getLockState: jest.Mock };
  let interceptor: WriteLockInterceptor;
  let next: CallHandler;

  beforeEach(() => {
    lockState = { getLockState: jest.fn().mockResolvedValue(UNLOCKED) };
    interceptor = new WriteLockInterceptor(
      lockState as unknown as LockStateService,
    );
    next = { handle: jest.fn().mockReturnValue(of('ok')) };
  });

  it('never touches reads (GET), even for a locked company', async () => {
    lockState.getLockState.mockResolvedValue(LOCKED_STATE);
    await interceptor.intercept(
      ctxFor({
        method: 'GET',
        path: '/v1/leads',
        user: { companyId: 'co-1', role: 'company_admin' },
      }),
      next,
    );
    expect(next.handle).toHaveBeenCalled();
    expect(lockState.getLockState).not.toHaveBeenCalled();
  });

  it('skips requests without a tenant user (public routes, webhooks)', async () => {
    await interceptor.intercept(
      ctxFor({ method: 'POST', path: '/v1/billing/webhook' }),
      next,
    );
    expect(next.handle).toHaveBeenCalled();
    expect(lockState.getLockState).not.toHaveBeenCalled();
  });

  it('never blocks the super admin', async () => {
    await interceptor.intercept(
      ctxFor({
        method: 'POST',
        path: '/v1/leads',
        user: { companyId: 'co-1', role: 'super_admin' },
      }),
      next,
    );
    expect(next.handle).toHaveBeenCalled();
    expect(lockState.getLockState).not.toHaveBeenCalled();
  });

  it('exempts auth and billing writes so a locked company can pay its way out', async () => {
    lockState.getLockState.mockResolvedValue(LOCKED_STATE);
    for (const path of ['/v1/auth/logout', '/v1/billing/checkout']) {
      await interceptor.intercept(
        ctxFor({
          method: 'POST',
          path,
          user: { companyId: 'co-1', role: 'company_admin' },
        }),
        next,
      );
    }
    expect(next.handle).toHaveBeenCalledTimes(2);
    expect(lockState.getLockState).not.toHaveBeenCalled();
  });

  it('blocks a tenant write with HTTP 423 when the company is locked', async () => {
    lockState.getLockState.mockResolvedValue(LOCKED_STATE);
    await expect(
      interceptor.intercept(
        ctxFor({
          method: 'POST',
          path: '/v1/leads',
          user: { companyId: 'co-1', role: 'company_admin' },
        }),
        next,
      ),
    ).rejects.toMatchObject({
      status: 423,
      response: expect.objectContaining({ code: 'COMPANY_LOCKED' }),
    });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('lets writes through while the lock is lifted (grace)', async () => {
    lockState.getLockState.mockResolvedValue({
      ...LOCKED_STATE,
      locked: false,
      lifted: true,
      liftUntil: '2026-08-15T00:00:00.000Z',
    });
    await interceptor.intercept(
      ctxFor({
        method: 'PATCH',
        path: '/v1/leads/abc',
        user: { companyId: 'co-1', role: 'agent' },
      }),
      next,
    );
    expect(next.handle).toHaveBeenCalled();
  });

  it('lets writes through for an unlocked company', async () => {
    await interceptor.intercept(
      ctxFor({
        method: 'DELETE',
        path: '/v1/leads/abc',
        user: { companyId: 'co-1', role: 'company_admin' },
      }),
      next,
    );
    expect(next.handle).toHaveBeenCalled();
    expect(lockState.getLockState).toHaveBeenCalledWith('co-1');
  });
});
