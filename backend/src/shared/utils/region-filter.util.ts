// A unit has no region_code of its own, so its region comes from its city.
// This resolves that for ONE unit, which is how cheques, transactions and work
// orders derive the region they then store. Callers that FILTER by region do it
// through the relation instead; this is not the only walk of the chain.

import { Repository } from 'typeorm';
import { Unit } from '../../modules/properties/entities/unit.entity';

export async function regionOfUnit(
  unitRepository: Repository<Unit>,
  unitId: string | null | undefined,
  companyId: string,
): Promise<string | undefined> {
  if (!unitId) {
    return undefined;
  }
  const row = await unitRepository
    .createQueryBuilder('u')
    .innerJoin('u.asset', 'a')
    .innerJoin('a.locality', 'loc')
    .innerJoin('loc.city', 'ci')
    .select('ci.regionCode', 'regionCode')
    .where('u.id = :unitId', { unitId })
    .andWhere('u.companyId = :companyId', { companyId })
    .getRawOne<{ regionCode: string }>();
  return row?.regionCode ?? undefined;
}
