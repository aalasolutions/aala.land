import { DataSource, EntityManager } from 'typeorm';

/** Serializes per-company writes; READ COMMITTED lets check-then-act race without a lock. */
export function withCompanyLock<T>(
  dataSource: DataSource,
  companyId: string,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await acquireCompanyLock(manager, companyId);
    return fn(manager);
  });
}

/** Same lock as withCompanyLock; key derivation must match exactly or the two stop excluding. */
export function acquireCompanyLock(
  manager: EntityManager,
  companyId: string,
): Promise<unknown> {
  return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    companyId,
  ]);
}
