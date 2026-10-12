import { UnitSubType } from '../properties/entities/unit-sub-type.enum';
import { LeaseType } from './entities/lease.entity';

// Null means the kind takes either lease type.
export const LEASE_TYPE_BY_UNIT_SUB_TYPE: Record<
  UnitSubType,
  LeaseType | null
> = {
  [UnitSubType.APARTMENT]: LeaseType.RESIDENTIAL,
  [UnitSubType.VILLA]: LeaseType.RESIDENTIAL,
  [UnitSubType.TOWNHOUSE]: LeaseType.RESIDENTIAL,
  [UnitSubType.PENTHOUSE]: LeaseType.RESIDENTIAL,
  [UnitSubType.OFFICE_SPACE]: LeaseType.COMMERCIAL,
  [UnitSubType.RETAIL_STORE]: LeaseType.COMMERCIAL,
  [UnitSubType.WAREHOUSE]: LeaseType.COMMERCIAL,
  [UnitSubType.LAND_PLOT]: null,
};
