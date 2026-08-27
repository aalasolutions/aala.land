import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, In, Not } from 'typeorm';
import { PropertyArea } from './entities/property-area.entity';
import { Asset } from './entities/asset.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { ContactsService } from '../contacts/contacts.service';
import { ContactIdentityDto } from '../contacts/dto/contact-identity.dto';
import {
  attachDisplayName,
  contactDisplayName,
} from '../../shared/utils/contact.util';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import {
  paginationOptions,
  pageSkip,
} from '../../shared/utils/pagination.util';
import {
  normalizedNameSql,
  normalizedNameWhere,
  sanitizeName,
  isUniqueViolation,
} from '../../shared/utils/name-normalization.util';
import { seesAllRegions } from '../../shared/utils/region-visibility.util';
import { UserRegion } from '../users/entities/user-region.entity';

// True when inline owner details carry at least one identifying value. An empty
// object must not reach resolveOrCreate, which would insert an all-null contact.
function hasContactIdentity(
  owner: ContactIdentityDto | undefined,
): owner is ContactIdentityDto {
  return Boolean(
    owner && (owner.firstName || owner.lastName || owner.phone || owner.email),
  );
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
    @InjectRepository(PropertyArea)
    private readonly areaRepository: Repository<PropertyArea>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(PropertyMedia)
    private readonly mediaRepository: Repository<PropertyMedia>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(UserRegion)
    private readonly userRegionRepository: Repository<UserRegion>,
    private readonly contactsService: ContactsService,
  ) {}

  // Areas
  async createArea(
    companyId: string,
    dto: CreateAreaDto,
  ): Promise<PropertyArea> {
    const area = this.areaRepository.create({ ...dto, companyId });
    return this.areaRepository.save(area);
  }

  async findAllAreas(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
  ) {
    const where: FindOptionsWhere<PropertyArea> = { companyId };
    if (regionCode) where.regionCode = regionCode;

    const [areas, total] = await this.areaRepository.findAndCount({
      where,
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });

    const data = areas.map((area) => ({
      ...area,
      assetCount: 0,
      unitCount: 0,
    }));

    return { data, total, page, limit };
  }

  async findOneArea(id: string, companyId: string): Promise<PropertyArea> {
    const area = await this.areaRepository.findOne({
      where: { id, companyId },
    });
    if (!area) throw new NotFoundException(`Area not found`);
    return area;
  }

  async updateArea(
    id: string,
    companyId: string,
    dto: UpdateAreaDto,
  ): Promise<PropertyArea> {
    const area = await this.findOneArea(id, companyId);
    Object.assign(area, dto);
    return this.areaRepository.save(area);
  }

  async removeArea(id: string, companyId: string): Promise<void> {
    const area = await this.findOneArea(id, companyId);
    await this.areaRepository.remove(area);
  }

  // Assets
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
  ) {
    const [data, total] = await this.assetRepository.findAndCount({
      where: [
        { localityId, units: { companyId } },
        { localityId, createdByCompanyId: companyId },
      ],
      relations: ['locality', 'locality.city', 'units'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });

    const filtered = data.map((a) => ({
      ...a,
      units: (a.units || []).filter((u) => u.companyId === companyId),
    }));

    return { data: filtered, total, page, limit };
  }

  async findAllAssets(
    companyId: string,
    page = 1,
    limit = 100,
    user?: { userId: string; role: string },
  ) {
    const scopedCodes = await this.scopedRegionCodes(user);
    if (scopedCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const regionWhere = scopedCodes
      ? { locality: { city: { regionCode: In(scopedCodes) } } }
      : {};
    const [data, total] = await this.assetRepository.findAndCount({
      where: [
        { units: { companyId }, ...regionWhere },
        { createdByCompanyId: companyId, ...regionWhere },
      ],
      relations: ['locality', 'locality.city', 'units'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });

    const filtered = data.map((a) => ({
      ...a,
      units: (a.units || []).filter((u) => u.companyId === companyId),
    }));

    return { data: filtered, total, page, limit };
  }


  async searchAssets(
    companyId: string,
    localityId: string,
    q: string,
    user?: { userId: string; role: string },
  ): Promise<any[]> {
    if (typeof q !== 'string') {
      return [];
    }

    const query = sanitizeName(q);
    if (!query) {
      return [];
    }

    const results = await this.assetRepository.query(
      `SELECT *
             FROM (
                 SELECT DISTINCT ON (${normalizedNameSql('name')})
                     id,
                     name,
                     address,
                     similarity(name, $1) AS score
                 FROM assets
                 WHERE locality_id = $2
                   AND company_id = $3
                   AND similarity(name, $1) > 0.2
                 ORDER BY ${normalizedNameSql('name')}, score DESC, name ASC
             ) deduped
             ORDER BY score DESC, name ASC
             LIMIT 10`,
      [query, localityId, companyId],
    );
    return results;
  }

  // companyId is optional only because SUPER_ADMIN legitimately reads across
  // tenants; for everyone else omitting it exposed other companies' assets.
  async findOneAsset(id: string, companyId?: string): Promise<Asset> {
    const asset = await this.assetRepository.findOne({
      where: { id, ...(companyId ? { companyId } : {}) },
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

  async removeAsset(id: string): Promise<void> {
    const asset = await this.assetRepository.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Asset not found`);
    await this.assetRepository.remove(asset);
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

  // Units
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

    qb.skip(pageSkip(page, limit)).take(limit);

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
    }));

    return { data, total, page, limit };
  }

  async createUnit(
    companyId: string,
    dto: CreateUnitDto,
    userId?: string,
  ): Promise<Unit> {
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
    return this.findOneUnit(saved.id, companyId);
  }

  async findUnitsByAsset(
    assetId: string,
    companyId: string,
    page = 1,
    limit = 20,
  ) {
    const [data, total] = await this.unitRepository.findAndCount({
      where: { assetId, companyId },
      relations: ['owner'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  // Regions the caller may read, or null when they read all of them. Endpoints
  // that span regions cannot rely on RegionScopeInterceptor: it only sanitises the
  // `regionCode` query param, so a method that never reads that param is unscoped.
  private async scopedRegionCodes(user?: {
    userId: string;
    role: string;
  }): Promise<string[] | null> {
    if (!user || seesAllRegions(user.role)) {
      return null;
    }
    const assigned = await this.userRegionRepository.find({
      where: { userId: user.userId },
      select: { regionCode: true },
    });
    return assigned.map((row) => row.regionCode);
  }

  async countUnitsByRegion(
    companyId: string,
    user?: { userId: string; role: string },
  ): Promise<Record<string, number>> {
    const scopedCodes = await this.scopedRegionCodes(user);
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

  async findOneUnit(id: string, companyId: string): Promise<Unit> {
    const unit = await this.unitRepository.findOne({
      where: { id, companyId },
      relations: ['asset', 'asset.locality', 'owner'],
    });
    if (!unit) throw new NotFoundException(`Property not found`);
    // owner is a raw Contact relation; attach displayName so a phone-only owner
    // renders instead of blanking.
    attachDisplayName(unit.owner);
    return unit;
  }

  async updateUnit(
    id: string,
    companyId: string,
    dto: UpdateUnitDto,
    userId?: string,
  ): Promise<Unit> {
    const unit = await this.findOneUnit(id, companyId);
    const { ownerId, owner, ...rest } = dto;
    Object.assign(unit, rest);
    if ('ownerId' in dto || hasContactIdentity(owner)) {
      const resolvedId = await this.resolveOwnerId(
        companyId,
        ownerId ?? undefined,
        owner,
        userId,
        unit.assetId,
      );
      unit.owner = resolvedId
        ? await this.verifyContactBelongsToCompany(resolvedId, companyId)
        : null;
      unit.ownerId = resolvedId ?? null;
    }
    await this.unitRepository.save(unit);
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

  // A new owner contact belongs to the region of the unit being created, not to
  // the company default, or region-scoped users would never see that owner.
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

  async removeUnit(id: string, companyId: string): Promise<void> {
    const unit = await this.findOneUnit(id, companyId);
    await this.unitRepository.remove(unit);
  }

  async bulkImportUnits(
    companyId: string,
    csvContent: string,
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

      try {
        const sqFt = parseFloat(row['sqft'] || '0') || undefined;
        const price = parseFloat(row['price'] || '0') || undefined;
        const unit = this.unitRepository.create({
          companyId,
          unitNumber: row['unitnumber'],
          assetId: row['assetid'],
          bedrooms: parseInt(row['bedrooms'] || '0', 10),
          bathrooms: parseInt(row['bathrooms'] || '0', 10),
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
    user?: { userId: string; role: string },
  ) {
    const scopedCodes = await this.scopedRegionCodes(user);
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
