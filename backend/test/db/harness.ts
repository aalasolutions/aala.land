import { DataSource, EntityManager } from 'typeorm';
import { Company } from '../../src/modules/companies/entities/company.entity';

class Rollback extends Error {}

/**
 * Runs `work` inside a transaction that always rolls back, so a case can seed
 * real rows and assert against real constraints without leaving anything behind.
 */
export async function seeded<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  let captured!: T;
  try {
    await dataSource.transaction(async (manager) => {
      captured = await work(manager);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return captured;
}

/** A company with a unique slug, so parallel cases cannot collide. */
export async function seedCompany(
  manager: EntityManager,
  label: string,
  activeRegions: string[],
): Promise<Company> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const repo = manager.getRepository(Company);
  return repo.save(
    repo.create({
      name: `${label} ${suffix}`,
      slug: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      activeRegions,
      defaultRegionCode: activeRegions[0],
    }),
  );
}

/** A city, locality, asset and unit, so a lease has a region chain to resolve. */
export async function seedUnit(
  manager: EntityManager,
  companyId: string,
  regionCode: string,
  country = 'SA',
): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const city: { id: string }[] = await manager.query(
    `INSERT INTO "cities" ("name", "region_code", "country", "created_by_company_id")
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`City ${suffix}`, regionCode, country, companyId],
  );
  const locality: { id: string }[] = await manager.query(
    `INSERT INTO "localities" ("name", "city_id", "created_by_company_id")
     VALUES ($1, $2, $3) RETURNING id`,
    [`Locality ${suffix}`, city[0].id, companyId],
  );
  const asset: { id: string }[] = await manager.query(
    `INSERT INTO "assets" ("name", "locality_id", "company_id")
     VALUES ($1, $2, $3) RETURNING id`,
    [`Asset ${suffix}`, locality[0].id, companyId],
  );
  const unit: { id: string }[] = await manager.query(
    `INSERT INTO "units" ("unit_number", "asset_id", "company_id")
     VALUES ($1, $2, $3) RETURNING id`,
    [`U-${suffix}`, asset[0].id, companyId],
  );
  return unit[0].id;
}
