// Resolves a unit's region via the Unit > Asset > Locality > City FK chain.

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
