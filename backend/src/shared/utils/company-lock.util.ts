import { DataSource, EntityManager } from 'typeorm';

/**
 * Serialize a per-company critical section behind a Postgres transaction-scoped
 * advisory lock.
 *
 * Postgres runs at READ COMMITTED and the codebase has no version columns, so
 * the seat/cap/removal flows are all check-then-act sequences that can otherwise
 * interleave: two concurrent user adds both read `purchasedSeats = 5`, both push
 * Stripe to 6, and a real paid seat silently vanishes from billing (race audit
 * 2026-07-07, P1/P2/P3). Wrapping every one of those mutations in this helper,
 * keyed on the companyId, makes them mutually exclusive per company.
 *
 * `pg_advisory_xact_lock(hashtext($1))` takes an exclusive lock bound to the
 * enclosing transaction; Postgres releases it automatically on COMMIT or
 * ROLLBACK, so there is no unlock to leak even if `fn` throws. hashtext maps the
 * uuid string to the bigint the lock API needs; a hash collision only means two
 * unrelated companies briefly serialize, which is harmless.
 *
 * Scope the callback to the seat/cap/removal work only. A Stripe call inside is
 * acceptable for these low-frequency, per-company operations, but do NOT run
 * unrelated long work under the held lock.
 *
 * @param dataSource TypeORM DataSource used to open the transaction.
 * @param companyId  Tenant key the lock is bound to.
 * @param fn         Critical section; receives the transaction's EntityManager.
 */
export function withCompanyLock<T>(
  dataSource: DataSource,
  companyId: string,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      companyId,
    ]);
    return fn(manager);
  });
}
