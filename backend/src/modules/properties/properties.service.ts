import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
} from 'typeorm';
import { Asset } from './entities/asset.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { PropertyDocument } from './entities/property-document.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { Cheque, ChequeStatus } from '../cheques/entities/cheque.entity';
import {
  Transaction,
  TransactionStatus,
} from '../financial/entities/transaction.entity';
import {
  WorkOrder,
  WorkOrderStatus,
} from '../maintenance/entities/work-order.entity';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import { UnitArchivedFilter } from './dto/unit-archived-filter.enum';
import { Contact } from '../contacts/entities/contact.entity';
import { ContactsService } from '../contacts/contacts.service';
import { ContactIdentityDto } from '../contacts/dto/contact-identity.dto';
import {
  attachDisplayName,
  contactDisplayName,
} from '../../shared/utils/contact.util';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import {
  paginationOptions,
  pageSkip,
  clampLimit,
} from '../../shared/utils/pagination.util';
import {
  normalizedNameSql,
  normalizedNameWhere,
  sanitizeName,
  isUniqueViolation,
} from '../../shared/utils/name-normalization.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';

// An empty object must not reach resolveOrCreate, which would insert an all-null contact
function hasContactIdentity(
  owner: ContactIdentityDto | undefined,
): owner is ContactIdentityDto {
  return Boolean(
    owner && (owner.firstName || owner.lastName || owner.phone || owner.email),
  );
}

function joinList(items: string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Absent or non-numeric stays unknown (null); an explicit "0" is a real studio.
function parseOptionalInt(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// Whitelist: nothing user-supplied ever reaches ORDER BY.
const UNIT_SORT_COLUMNS: Record<string, string[]> = {
  name: ['a.name', 'u.unitNumber'],
  price: ['u.price'],
  area: ['u.sqFt'],
  added: ['u.createdAt'],
};

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(PropertyMedia)
    private readonly mediaRepository: Repository<PropertyMedia>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly contactsService: ContactsService,
    private readonly dataSource: DataSource,
    private readonly recordHistory: RecordHistoryService,
    private readonly storagePurge: StoragePurgeService,
  ) {}

  async createAsset(companyId: string, dto: CreateAssetDto): Promise<Asset> {
    const sanitizedName = sanitizeName(dto.name);
    if (!sanitizedName) {
      throw new BadRequestException(
        'Asset name is required and cannot be empty or whitespace-only',
      );
    }
    const existing = await this.findAssetByNormalizedName(
      dto.localityId,
      sanitizedName,
    );
    if (existing) {
      return existing;
    }
    const asset = this.assetRepository.create({
      ...dto,
      name: sanitizedName,
      createdByCompanyId: companyId,
    });
    try {
      return await this.assetRepository.save(asset);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const duplicate = await this.findAssetByNormalizedName(
          dto.localityId,
          sanitizedName,
        );
        if (duplicate) {
          return duplicate;
        }
      }

      throw error;
    }
  }

  async findAssetsByLocality(
    localityId: string,
    companyId: string,
    page = 1,
    limit = 20,
    user?: { userId: string; role: string; regionCodes: string[] },
    regionCode?: string,
  ) {
    const scopedCodes = effectiveRegionCodes(regionCode, user);
    if (scopedCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const regionWhere = scopedCodes
      ? { locality: { city: { regionCode: In(scopedCodes) } } }
      : {};
    const [data, total] = await this.assetRepository.findAndCount({
      where: [
        {
          localityId,
          units: { companyId, deletedAt: IsNull() },
          ...regionWhere,
        },
        { localityId, createdByCompanyId: companyId, ...regionWhere },
      ],
      relations: ['locality', 'locality.city', 'units'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });

    const filtered = data.map((a) => ({
      ...a,
      units: (a.units || []).filter(
        (u) => u.companyId === companyId && !u.deletedAt,
      ),
    }));

    return { data: filtered, total, page, limit };
  }

  async findAllAssets(
    companyId: string,
    page = 1,
    limit = 100,
    user?: { userId: string; role: string; regionCodes: string[] },
  ) {
    const scopedCodes = scopedRegionCodes(user);
    if (scopedCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const regionWhere = scopedCodes
      ? { locality: { city: { regionCode: In(scopedCodes) } } }
      : {};
    const [data, total] = await this.assetRepository.findAndCount({
      where: [
        { units: { companyId, deletedAt: IsNull() }, ...regionWhere },
        { createdByCompanyId: companyId, ...regionWhere },
      ],
      relations: ['locality', 'locality.city', 'units'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });

    const filtered = data.map((a) => ({
      ...a,
      units: (a.units || []).filter(
        (u) => u.companyId === companyId && !u.deletedAt,
      ),
    }));

    return { data: filtered, total, page, limit };
  }

  async searchAssets(
    companyId: string | undefined,
    localityId: string,
    q: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<any[]> {
    if (typeof q !== 'string') {
      return [];
    }

    const query = sanitizeName(q);
    if (!query) {
      return [];
    }

    const scopedCodes = scopedRegionCodes(user);
    // No assignments means nothing is visible, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      return [];
    }

    // Still a bound parameter, just conditionally present.
    const params: unknown[] = [query, localityId];
    let companyPredicate = '';
    if (companyId) {
      params.push(companyId);
      companyPredicate = `AND a.company_id = $${params.length}`;
    }

    let regionPredicate = '';
    if (scopedCodes) {
      params.push(scopedCodes);
      regionPredicate = `AND ci.region_code = ANY($${params.length}::varchar[])`;
    }

    const results = await this.assetRepository.query(
      `SELECT *
             FROM (
                 SELECT DISTINCT ON (${normalizedNameSql('a.name')})
                     a.id,
                     a.name,
                     a.address,
                     similarity(a.name, $1) AS score
                 FROM assets a
                 INNER JOIN localities loc ON loc.id = a.locality_id
                 INNER JOIN cities ci ON ci.id = loc.city_id
                 WHERE a.locality_id = $2
                   ${companyPredicate}
                   ${regionPredicate}
                   AND similarity(a.name, $1) > 0.2
                 ORDER BY ${normalizedNameSql('a.name')}, score DESC, a.name ASC
             ) deduped
             ORDER BY score DESC, name ASC
             LIMIT 10`,
      params,
    );
    return results;
  }

  // companyId optional only for SUPER_ADMIN; predicate mirrors findAllAssets
  async findOneAsset(
    id: string,
    companyId?: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<Asset> {
    const scopedCodes = scopedRegionCodes(user);
    if (scopedCodes?.length === 0)
      throw new NotFoundException(`Asset not found`);

    const regionWhere = scopedCodes
      ? { locality: { city: { regionCode: In(scopedCodes) } } }
      : {};
    const asset = await this.assetRepository.findOne({
      where: companyId
        ? [
            { id, units: { companyId, deletedAt: IsNull() }, ...regionWhere },
            { id, createdByCompanyId: companyId, ...regionWhere },
          ]
        : { id, ...regionWhere },
      relations: ['locality'],
    });
    if (!asset) throw new NotFoundException(`Asset not found`);
    return asset;
  }

  async updateAsset(id: string, dto: UpdateAssetDto): Promise<Asset> {
    const asset = await this.assetRepository.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Asset not found`);

    if (dto.name !== undefined) {
      if (typeof dto.name !== 'string') {
        throw new BadRequestException('Asset name must be a string');
      }

      const sanitizedName = sanitizeName(dto.name);
      if (!sanitizedName) {
        throw new BadRequestException(
          'Asset name is required and cannot be empty or whitespace-only',
        );
      }
      const duplicate = await this.findAssetByNormalizedName(
        asset.localityId,
        sanitizedName,
        id,
      );
      if (duplicate) {
        throw new ConflictException('Asset already exists in this locality');
      }

      asset.name = sanitizedName;
    }

    if (dto.address !== undefined) {
      asset.address = dto.address;
    }

    try {
      return await this.assetRepository.save(asset);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Asset already exists in this locality');
      }

      throw error;
    }
  }

  // Asset rows are shared, so the unit count and file purge span companies.
  async removeAsset(
    id: string,
    reason: string,
    actorId: string,
  ): Promise<void> {
    const purgeIds = await this.dataSource.transaction(async (manager) => {
      const asset = await manager.findOne(Asset, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!asset) throw new NotFoundException(`Asset not found`);

      const unitCount = await manager.count(Unit, { where: { assetId: id } });
      if (unitCount > 0) {
        throw new ConflictException(
          `This asset still has ${unitCount} unit${unitCount === 1 ? '' : 's'}. Delete them first.`,
        );
      }

      const [media, documents] = await Promise.all([
        manager.find(PropertyMedia, { where: { assetId: id } }),
        manager.find(PropertyDocument, { where: { assetId: id } }),
      ]);
      const ids = await this.storagePurge.purge(manager, { media, documents });

      await this.recordHistory.record(manager, {
        companyId: null,
        action: RecordHistoryAction.DELETE,
        entityType: 'Asset',
        entityId: asset.id,
        entityTitle: asset.name,
        reason,
        actorId,
        actorName: await this.recordHistory.resolveActorName(manager, actorId),
        metadata: { fileCount: media.length + documents.length },
      });

      await manager.delete(Asset, { id });
      return ids;
    });
    void this.storagePurge.dispatch(purgeIds);
  }

  private findAssetByNormalizedName(
    localityId: string,
    name: string,
    excludeId?: string,
  ): Promise<Asset | null> {
    const where: FindOptionsWhere<Asset> = {
      localityId,
      name: normalizedNameWhere(name),
    };

    if (excludeId) {
      where.id = Not(excludeId);
    }

    return this.assetRepository.findOne({ where });
  }

  async findAllUnits(
    companyId: string,
    page = 1,
    limit = 100,
    filters?: {
      amenities?: string[];
      propertyType?: string;
      status?: string;
      minPrice?: number;
      maxPrice?: number;
      minBeds?: number;
      maxBeds?: number;
      localityId?: string;
      regionCode?: string;
      ownerId?: string;
      archived?: UnitArchivedFilter;
    },
    sort?: { field?: string; direction?: string },
  ) {
    const qb = this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'a')
      .innerJoin('a.locality', 'loc')
      .innerJoin('loc.city', 'ci')
      .leftJoin('u.owner', 'o')
      .addSelect([
        'a.id',
        'a.name',
        'a.propertyType',
        'loc.id',
        'loc.name',
        'o.id',
        'o.firstName',
        'o.lastName',
        'o.phone',
      ])
      .where('u.companyId = :companyId', { companyId });

    if (filters?.amenities?.length) {
      qb.andWhere('u.amenities @> :amenities', {
        amenities: JSON.stringify(filters.amenities),
      });
    }
    if (filters?.propertyType) {
      qb.andWhere('u.propertyType = :propertyType', {
        propertyType: filters.propertyType,
      });
    }
    if (filters?.status) {
      qb.andWhere('u.status = :status', { status: filters.status });
    }
    if (filters?.minPrice !== undefined) {
      qb.andWhere('u.price >= :minPrice', { minPrice: filters.minPrice });
    }
    if (filters?.maxPrice !== undefined) {
      qb.andWhere('u.price <= :maxPrice', { maxPrice: filters.maxPrice });
    }
    if (filters?.minBeds !== undefined) {
      qb.andWhere('u.bedrooms >= :minBeds', { minBeds: filters.minBeds });
    }
    if (filters?.maxBeds !== undefined) {
      qb.andWhere('u.bedrooms <= :maxBeds', { maxBeds: filters.maxBeds });
    }
    if (filters?.localityId) {
      qb.andWhere('loc.id = :localityId', { localityId: filters.localityId });
    }
    if (filters?.regionCode) {
      qb.andWhere('ci.regionCode = :regionCode', {
        regionCode: filters.regionCode,
      });
    }
    if (filters?.ownerId) {
      qb.andWhere('u.ownerId = :ownerId', { ownerId: filters.ownerId });
    }
    const archived = filters?.archived ?? UnitArchivedFilter.EXCLUDE;
    if (archived === UnitArchivedFilter.EXCLUDE) {
      qb.andWhere('u.deletedAt IS NULL');
    } else if (archived === UnitArchivedFilter.ONLY) {
      qb.andWhere('u.deletedAt IS NOT NULL');
    }

    qb.skip(pageSkip(page, limit)).take(clampLimit(limit));

    const sortColumns = sort?.field ? UNIT_SORT_COLUMNS[sort.field] : undefined;
    if (sortColumns) {
      // NULLS LAST both ways so unpriced or unmeasured units never lead the list.
      const direction = sort?.direction === 'DESC' ? 'DESC' : 'ASC';
      qb.orderBy(sortColumns[0], direction, 'NULLS LAST');
      for (const column of sortColumns.slice(1)) {
        qb.addOrderBy(column, direction, 'NULLS LAST');
      }
    } else {
      qb.orderBy('loc.name', 'ASC')
        .addOrderBy('a.name', 'ASC')
        .addOrderBy('u.unitNumber', 'ASC');
    }

    const [units, total] = await qb.getManyAndCount();

    const unitIds = units.map((u) => u.id);
    const primaryPhotoMap = new Map<string, string>();
    if (unitIds.length > 0) {
      const mediaList = await this.mediaRepository.find({
        where: { unitId: In(unitIds), companyId },
        order: { isPrimary: 'DESC', createdAt: 'DESC' },
        select: ['unitId', 'url', 'thumbnailUrl'],
      });
      for (const m of mediaList) {
        if (!primaryPhotoMap.has(m.unitId)) {
          primaryPhotoMap.set(m.unitId, m.thumbnailUrl ?? m.url);
        }
      }
    }

    const data = units.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      status: u.status,
      price: u.price,
      sqFt: u.sqFt,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      propertyType: u.propertyType ?? null,
      amenities: u.amenities,
      photos: primaryPhotoMap.has(u.id) ? [primaryPhotoMap.get(u.id)!] : [],
      floor: u.floor,
      assetId: u.assetId,
      assetName: u.asset?.name ?? '',
      areaId: u.asset?.locality?.id ?? '',
      areaName: u.asset?.locality?.name ?? '',
      ownerName: contactDisplayName(u.owner),
      deletedAt: u.deletedAt ?? null,
    }));

    return { data, total, page, limit };
  }

  async createUnit(
    companyId: string,
    dto: CreateUnitDto,
    userId?: string,
    user?: { role: string; regionCodes: string[] },
  ): Promise<Unit> {
    await this.assertAssetInCallerRegions(dto.assetId, user);
    const { owner, ...rest } = dto;
    const ownerId = await this.resolveOwnerId(
      companyId,
      dto.ownerId,
      owner,
      userId,
      dto.assetId,
    );
    const unit = this.unitRepository.create({
      ...rest,
      ownerId: ownerId ?? undefined,
      companyId,
    });
    const saved = await this.unitRepository.save(unit);
    // Unscoped re-read: a create must not succeed and then 404 on the way out
    return this.findOneUnit(saved.id, companyId);
  }

  async findUnitsByAsset(
    assetId: string,
    companyId: string,
    page = 1,
    limit = 20,
    user?: { userId: string; role: string; regionCodes: string[] },
    archived: UnitArchivedFilter = UnitArchivedFilter.EXCLUDE,
    regionCode?: string,
  ) {
    const scopedCodes = effectiveRegionCodes(regionCode, user);
    if (scopedCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const where: FindOptionsWhere<Unit> = { assetId, companyId };
    if (archived === UnitArchivedFilter.EXCLUDE) {
      where.deletedAt = IsNull();
    } else if (archived === UnitArchivedFilter.ONLY) {
      where.deletedAt = Not(IsNull());
    }
    if (scopedCodes) {
      where.asset = { locality: { city: { regionCode: In(scopedCodes) } } };
    }

    const [data, total] = await this.unitRepository.findAndCount({
      where,
      relations: ['owner'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async countUnitsByRegion(
    companyId: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<Record<string, number>> {
    const scopedCodes = scopedRegionCodes(user);
    // No assignments means nothing to report, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      return {};
    }

    const qb = this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'a')
      .innerJoin('a.locality', 'loc')
      .innerJoin('loc.city', 'ci')
      .select('ci.regionCode', 'regionCode')
      .addSelect('COUNT(u.id)', 'count')
      .where('u.companyId = :companyId', { companyId })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('ci.regionCode');

    if (scopedCodes) {
      qb.andWhere('ci.regionCode IN (:...scopedCodes)', { scopedCodes });
    }

    const rows = await qb.getRawMany<{ regionCode: string; count: string }>();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.regionCode] = Number(row.count);
    }
    return counts;
  }

  async findOneUnit(
    id: string,
    companyId: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<Unit> {
    const scopedCodes = scopedRegionCodes(user);
    if (scopedCodes?.length === 0)
      throw new NotFoundException(`Property not found`);

    const where: FindOptionsWhere<Unit> = { id, companyId };
    if (scopedCodes) {
      where.asset = { locality: { city: { regionCode: In(scopedCodes) } } };
    }

    const unit = await this.unitRepository.findOne({
      where,
      relations: ['asset', 'asset.locality', 'owner'],
    });
    if (!unit) throw new NotFoundException(`Property not found`);
    // Attach displayName so a phone-only owner renders instead of blanking
    attachDisplayName(unit.owner);
    return unit;
  }

  async updateUnit(
    id: string,
    companyId: string,
    dto: UpdateUnitDto,
    userId?: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<Unit> {
    const archivedMessage =
      'This unit is archived. Unarchive it before editing.';
    const unit = await this.findOneUnit(id, companyId, user);
    if (unit.deletedAt) {
      throw new ConflictException(archivedMessage);
    }
    const { ownerId, owner, ...rest } = dto;
    const ownerChanged = 'ownerId' in dto || hasContactIdentity(owner);
    const resolvedOwnerId = ownerChanged
      ? await this.resolveOwnerId(
          companyId,
          ownerId ?? undefined,
          owner,
          userId,
          unit.assetId,
        )
      : null;
    const resolvedOwner = resolvedOwnerId
      ? await this.verifyContactBelongsToCompany(resolvedOwnerId, companyId)
      : null;

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockUnit(manager, id, companyId, user);
      if (locked.deletedAt) {
        throw new ConflictException(archivedMessage);
      }
      Object.assign(locked, rest);
      if (ownerChanged) {
        locked.owner = resolvedOwner;
        locked.ownerId = resolvedOwnerId;
      }
      await manager.save(Unit, locked);
    });
    // Authorization happened above; this re-read only builds the response.
    return this.findOneUnit(id, companyId);
  }

  private async resolveOwnerId(
    companyId: string,
    ownerId: string | undefined,
    owner: ContactIdentityDto | undefined,
    userId?: string,
    assetId?: string | null,
  ): Promise<string | null> {
    if (ownerId) {
      await this.verifyContactBelongsToCompany(ownerId, companyId);
      return ownerId;
    }
    if (!hasContactIdentity(owner)) return null;
    const contact = await this.contactsService.resolveOrCreate(
      companyId,
      owner,
      userId,
      await this.regionOfAsset(assetId),
    );
    return contact.id;
  }

  // A unit inherits its region from its asset; block writes to assets outside caller regions
  private async assertAssetInCallerRegions(
    assetId: string | undefined,
    user?: { role: string; regionCodes: string[] },
  ): Promise<void> {
    const scopedCodes = scopedRegionCodes(user);
    if (!scopedCodes) return;
    const region = await this.regionOfAsset(assetId);
    if (!region || !scopedCodes.includes(region)) {
      throw new NotFoundException(`Asset not found`);
    }
  }

  private async regionOfAsset(
    assetId?: string | null,
  ): Promise<string | undefined> {
    if (!assetId) return undefined;
    const row = await this.assetRepository
      .createQueryBuilder('a')
      .innerJoin('a.locality', 'loc')
      .innerJoin('loc.city', 'ci')
      .select('ci.regionCode', 'regionCode')
      .where('a.id = :assetId', { assetId })
      .getRawOne<{ regionCode: string }>();
    return row?.regionCode ?? undefined;
  }

  private async verifyContactBelongsToCompany(
    contactId: string,
    companyId: string,
  ): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, companyId },
    });
    if (!contact) throw new BadRequestException('Contact not found');
    return contact;
  }

  async removeUnit(
    id: string,
    companyId: string,
    reason: string,
    actorId: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<void> {
    const purgeIds = await this.dataSource.transaction(async (manager) => {
      const unit = await this.lockUnit(manager, id, companyId, user);

      const blockers = await this.unitDeleteBlockers(manager, id, companyId);
      if (blockers.length > 0) {
        throw new ConflictException(
          `This unit has linked ${joinList(blockers)}. Archive it instead.`,
        );
      }

      const [media, documents] = await Promise.all([
        manager.find(PropertyMedia, { where: { unitId: id, companyId } }),
        manager.find(PropertyDocument, { where: { unitId: id, companyId } }),
      ]);
      const ids = await this.storagePurge.purge(manager, { media, documents });

      await this.recordUnitHistory(manager, unit, {
        action: RecordHistoryAction.DELETE,
        reason,
        actorId,
        metadata: { fileCount: media.length + documents.length },
      });

      await manager.delete(Unit, { id, companyId });
      return ids;
    });
    void this.storagePurge.dispatch(purgeIds);
  }

  async archiveUnit(
    id: string,
    companyId: string,
    reason: string,
    actorId: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<Unit> {
    await this.dataSource.transaction(async (manager) => {
      const unit = await this.lockUnit(manager, id, companyId, user);
      if (unit.deletedAt) {
        throw new ConflictException('This unit is already archived.');
      }
      const blockers = await this.unitArchiveBlockers(manager, id, companyId);
      if (blockers.length > 0) {
        throw new ConflictException(
          `This unit has ${joinList(blockers)}. Close them before archiving.`,
        );
      }
      await manager.update(Unit, { id, companyId }, { deletedAt: new Date() });
      await this.recordUnitHistory(manager, unit, {
        action: RecordHistoryAction.ARCHIVE,
        reason,
        actorId,
      });
    });
    return this.findOneUnit(id, companyId);
  }

  async unarchiveUnit(
    id: string,
    companyId: string,
    reason: string | undefined,
    actorId: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ): Promise<Unit> {
    await this.dataSource.transaction(async (manager) => {
      const unit = await this.lockUnit(manager, id, companyId, user);
      if (!unit.deletedAt) {
        throw new ConflictException('This unit is not archived.');
      }
      await manager.update(Unit, { id, companyId }, { deletedAt: null });
      await this.recordUnitHistory(manager, unit, {
        action: RecordHistoryAction.UNARCHIVE,
        reason,
        actorId,
      });
    });
    return this.findOneUnit(id, companyId);
  }

  // Locks only the unit row; the joins supply region scope and history titles.
  private async lockUnit(
    manager: EntityManager,
    id: string,
    companyId: string,
    user?: { role: string; regionCodes: string[] },
  ): Promise<Unit> {
    const scopedCodes = scopedRegionCodes(user);
    if (scopedCodes?.length === 0)
      throw new NotFoundException(`Property not found`);

    const qb = manager
      .createQueryBuilder(Unit, 'u')
      .innerJoinAndSelect('u.asset', 'a')
      .innerJoinAndSelect('a.locality', 'loc')
      .innerJoinAndSelect('loc.city', 'ci')
      .where('u.id = :id', { id })
      .andWhere('u.companyId = :companyId', { companyId })
      .setLock('pessimistic_write', undefined, ['u']);
    if (scopedCodes) {
      qb.andWhere('ci.regionCode IN (:...scopedCodes)', { scopedCodes });
    }

    const unit = await qb.getOne();
    if (!unit) throw new NotFoundException(`Property not found`);
    return unit;
  }

  private async unitArchiveBlockers(
    manager: EntityManager,
    unitId: string,
    companyId: string,
  ): Promise<string[]> {
    const openCheque = In([
      ChequeStatus.PENDING,
      ChequeStatus.DEPOSITED,
      ChequeStatus.BOUNCED,
    ]);
    const [leases, leads, cheques, workOrders, transactions] =
      await Promise.all([
        manager.count(Lease, {
          where: { unitId, companyId, status: LeaseStatus.ACTIVE },
        }),
        manager.count(Lead, {
          where: {
            unitId,
            companyId,
            status: Not(In([LeadStatus.WON, LeadStatus.LOST])),
          },
        }),
        manager.count(Cheque, {
          where: [
            { unitId, companyId, status: openCheque },
            { lease: { unitId }, companyId, status: openCheque },
          ],
        }),
        manager.count(WorkOrder, {
          where: {
            unitId,
            companyId,
            status: Not(
              In([WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED]),
            ),
          },
        }),
        manager.count(Transaction, {
          where: {
            unitId,
            companyId,
            status: Not(
              In([TransactionStatus.COMPLETED, TransactionStatus.CANCELLED]),
            ),
          },
        }),
      ]);
    const blockers: string[] = [];
    if (leases > 0) blockers.push('an active lease');
    if (leads > 0) blockers.push('open leads');
    if (cheques > 0) blockers.push('open cheques');
    if (workOrders > 0) blockers.push('open work orders');
    if (transactions > 0) blockers.push('open transactions');
    return blockers;
  }

  private async unitDeleteBlockers(
    manager: EntityManager,
    unitId: string,
    companyId: string,
  ): Promise<string[]> {
    const where = { unitId, companyId };
    const [leases, cheques, transactions, workOrders, leads] =
      await Promise.all([
        manager.count(Lease, { where }),
        manager.count(Cheque, { where }),
        manager.count(Transaction, { where }),
        manager.count(WorkOrder, { where }),
        manager.count(Lead, { where }),
      ]);
    const blockers: string[] = [];
    if (leases > 0) blockers.push('leases');
    if (cheques > 0) blockers.push('cheques');
    if (transactions > 0) blockers.push('transactions');
    if (workOrders > 0) blockers.push('work orders');
    if (leads > 0) blockers.push('leads');
    return blockers;
  }

  private async recordUnitHistory(
    manager: EntityManager,
    unit: Unit,
    input: {
      action: RecordHistoryAction;
      reason?: string;
      actorId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.recordHistory.record(manager, {
      companyId: unit.companyId,
      action: input.action,
      entityType: 'Unit',
      entityId: unit.id,
      entityTitle: unit.unitNumber,
      contextTitle: unit.asset?.name ?? null,
      reason: input.reason ?? null,
      actorId: input.actorId,
      actorName: await this.recordHistory.resolveActorName(
        manager,
        input.actorId,
      ),
      regionCode: unit.asset?.locality?.city?.regionCode ?? null,
      metadata: input.metadata ?? null,
    });
  }

  async bulkImportUnits(
    companyId: string,
    csvContent: string,
    user?: { role: string; regionCodes: string[] },
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    if (!csvContent || typeof csvContent !== 'string') {
      return {
        created: 0,
        failed: 0,
        errors: ['CSV content is required and must be a string'],
      };
    }

    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return {
        created: 0,
        failed: 0,
        errors: ['CSV must have a header row and at least one data row'],
      };
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const results = { created: 0, failed: 0, errors: [] as string[] };
    const unitsToCreate: Unit[] = [];
    const scopedCodes = scopedRegionCodes(user);
    const regionByAsset = new Map<string, string | undefined>();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      if (!row['unitnumber'] || !row['assetid']) {
        results.failed++;
        results.errors.push(`Row ${i}: unitNumber and assetId are required`);
        continue;
      }

      if (scopedCodes) {
        const assetId = row['assetid'];
        if (!regionByAsset.has(assetId)) {
          regionByAsset.set(assetId, await this.regionOfAsset(assetId));
        }
        const region = regionByAsset.get(assetId);
        if (!region || !scopedCodes.includes(region)) {
          results.failed++;
          results.errors.push(`Row ${i}: asset is outside your regions`);
          continue;
        }
      }

      try {
        const sqFt = parseFloat(row['sqft'] || '0') || undefined;
        const price = parseFloat(row['price'] || '0') || undefined;
        const unit = this.unitRepository.create({
          companyId,
          unitNumber: row['unitnumber'],
          assetId: row['assetid'],
          bedrooms: parseOptionalInt(row['bedrooms']),
          bathrooms: parseOptionalInt(row['bathrooms']),
          sqFt,
          price,
          status: (row['status'] as any) || 'available',
        });
        unitsToCreate.push(unit);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.failed++;
        results.errors.push(`Row ${i}: ${message}`);
      }
    }

    if (unitsToCreate.length > 0) {
      try {
        await this.unitRepository.save(unitsToCreate);
        results.created = unitsToCreate.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push(`Batch insert failed: ${message}`);
        results.failed += unitsToCreate.length;
      }
    }

    return results;
  }

  async getAssetOccupancy(
    companyId: string,
    user?: { userId: string; role: string; regionCodes: string[] },
  ) {
    const scopedCodes = scopedRegionCodes(user);
    if (scopedCodes?.length === 0) {
      return [];
    }

    const qb = this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'a')
      .select('a.id', 'assetId')
      .addSelect('a.name', 'assetName')
      .addSelect('COUNT(*)::int', 'totalUnits')
      .addSelect(
        `SUM(CASE WHEN u.status = :rented THEN 1 ELSE 0 END)::int`,
        'rentedUnits',
      )
      .addSelect(
        `SUM(CASE WHEN u.status = :available THEN 1 ELSE 0 END)::int`,
        'availableUnits',
      )
      .where('u.companyId = :companyId', { companyId })
      .andWhere('u.deletedAt IS NULL')
      .setParameter('rented', UnitStatus.RENTED)
      .setParameter('available', UnitStatus.AVAILABLE)
      .groupBy('a.id')
      .addGroupBy('a.name');

    if (scopedCodes) {
      qb.innerJoin('a.locality', 'loc')
        .innerJoin('loc.city', 'ci')
        .andWhere('ci.regionCode IN (:...scopedCodes)', { scopedCodes });
    }

    const results = await qb.getRawMany();

    return results.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      totalUnits: Number(r.totalUnits),
      rentedUnits: Number(r.rentedUnits),
      availableUnits: Number(r.availableUnits),
      occupancyRate:
        Number(r.totalUnits) > 0
          ? Math.round((Number(r.rentedUnits) / Number(r.totalUnits)) * 100)
          : 0,
    }));
  }
}
