import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { PropertyArea } from './entities/property-area.entity';
import { Asset } from './entities/asset.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { Listing, ListingStatus } from './entities/listing.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { paginationOptions, pageSkip } from '../../shared/utils/pagination.util';

@Injectable()
export class PropertiesService {
    constructor(
        @InjectRepository(PropertyArea)
        private readonly areaRepository: Repository<PropertyArea>,
        @InjectRepository(Asset)
        private readonly assetRepository: Repository<Asset>,
        @InjectRepository(Unit)
        private readonly unitRepository: Repository<Unit>,
        @InjectRepository(Listing)
        private readonly listingRepository: Repository<Listing>,
    ) { }

    // Areas
    async createArea(companyId: string, dto: CreateAreaDto): Promise<PropertyArea> {
        const area = this.areaRepository.create({ ...dto, companyId });
        return this.areaRepository.save(area);
    }

    async findAllAreas(companyId: string, page = 1, limit = 20, regionCode?: string) {
        const where: FindOptionsWhere<PropertyArea> = { companyId };
        if (regionCode) where.regionCode = regionCode;

        const [areas, total] = await this.areaRepository.findAndCount({
            where,
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });

        const data = areas.map(area => ({
            ...area,
            assetCount: 0,
            unitCount: 0,
        }));

        return { data, total, page, limit };
    }

    async findOneArea(id: string, companyId: string): Promise<PropertyArea> {
        const area = await this.areaRepository.findOne({ where: { id, companyId } });
        if (!area) throw new NotFoundException(`Area not found`);
        return area;
    }

    async updateArea(id: string, companyId: string, dto: UpdateAreaDto): Promise<PropertyArea> {
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
        const existing = await this.assetRepository.findOne({
            where: { name: dto.name, localityId: dto.localityId },
        });
        if (existing) {
            return existing;
        }
        const asset = this.assetRepository.create({ ...dto, createdByCompanyId: companyId });
        return this.assetRepository.save(asset);
    }

    async findAssetsByLocality(localityId: string, companyId: string, page = 1, limit = 20) {
        const [data, total] = await this.assetRepository.findAndCount({
            where: [
                { localityId, units: { companyId } },
                { localityId, createdByCompanyId: companyId },
            ],
            relations: ['locality', 'locality.city', 'units'],
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });

        const filtered = data.map(a => ({
            ...a,
            units: (a.units || []).filter(u => u.companyId === companyId),
        }));

        return { data: filtered, total, page, limit };
    }

    async findAllAssets(companyId: string, page = 1, limit = 100) {
        const [data, total] = await this.assetRepository.findAndCount({
            where: [
                { units: { companyId } },
                { createdByCompanyId: companyId },
            ],
            relations: ['locality', 'locality.city', 'units'],
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });

        const filtered = data.map(a => ({
            ...a,
            units: (a.units || []).filter(u => u.companyId === companyId),
        }));

        return { data: filtered, total, page, limit };
    }

    async searchAssets(localityId: string, q: string): Promise<any[]> {
        const results = await this.assetRepository.query(
            `SELECT id, name, address, similarity(name, $1) AS score
             FROM buildings
             WHERE locality_id = $2
               AND similarity(name, $1) > 0.2
             ORDER BY score DESC
             LIMIT 10`,
            [q, localityId],
        );
        return results;
    }

    async findOneAsset(id: string): Promise<Asset> {
        const asset = await this.assetRepository.findOne({
            where: { id },
            relations: ['locality'],
        });
        if (!asset) throw new NotFoundException(`Asset not found`);
        return asset;
    }

    async updateAsset(id: string, dto: UpdateAssetDto): Promise<Asset> {
        const asset = await this.assetRepository.findOne({ where: { id } });
        if (!asset) throw new NotFoundException(`Asset not found`);
        Object.assign(asset, dto);
        return this.assetRepository.save(asset);
    }

    async removeAsset(id: string): Promise<void> {
        const asset = await this.assetRepository.findOne({ where: { id } });
        if (!asset) throw new NotFoundException(`Asset not found`);
        await this.assetRepository.remove(asset);
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
            regionCode?: string;
        },
    ) {
        const qb = this.unitRepository
            .createQueryBuilder('u')
            .innerJoin('u.asset', 'a')
            .innerJoin('a.locality', 'loc')
            .innerJoin('loc.city', 'ci')
            .leftJoin('u.owner', 'o')
            .addSelect(['a.id', 'a.name', 'a.propertyType', 'loc.id', 'loc.name', 'o.id', 'o.name'])
            .where('u.companyId = :companyId', { companyId });

        if (filters?.amenities?.length) {
            qb.andWhere('u.amenities @> :amenities', { amenities: JSON.stringify(filters.amenities) });
        }
        if (filters?.propertyType) {
            qb.andWhere('u.propertyType = :propertyType', { propertyType: filters.propertyType });
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
        if (filters?.regionCode) {
            qb.andWhere('ci.regionCode = :regionCode', { regionCode: filters.regionCode });
        }

        qb.skip(pageSkip(page, limit))
            .take(limit)
            .orderBy('loc.name', 'ASC')
            .addOrderBy('a.name', 'ASC')
            .addOrderBy('u.unitNumber', 'ASC');

        const [units, total] = await qb.getManyAndCount();

        const data = units.map(u => ({
            id: u.id,
            unitNumber: u.unitNumber,
            status: u.status,
            price: u.price,
            sqFt: u.sqFt,
            bedrooms: u.bedrooms,
            bathrooms: u.bathrooms,
            propertyType: u.propertyType ?? null,
            amenities: u.amenities,
            photos: u.photos,
            floor: u.floor,
            assetId: u.assetId,
            assetName: u.asset?.name ?? '',
            areaId: u.asset?.locality?.id ?? '',
            areaName: u.asset?.locality?.name ?? '',
            ownerName: u.owner?.name ?? null,
        }));

        return { data, total, page, limit };
    }

    async createUnit(companyId: string, dto: CreateUnitDto): Promise<Unit> {
        const unit = this.unitRepository.create({ ...dto, companyId });
        return this.unitRepository.save(unit);
    }

    async findUnitsByAsset(assetId: string, companyId: string, page = 1, limit = 20) {
        const [data, total] = await this.unitRepository.findAndCount({
            where: { assetId, companyId },
            relations: ['owner'],
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOneUnit(id: string, companyId: string): Promise<Unit> {
        const unit = await this.unitRepository.findOne({
            where: { id, companyId },
            relations: ['asset', 'asset.locality', 'owner'],
        });
        if (!unit) throw new NotFoundException(`Unit not found`);
        return unit;
    }

    async updateUnit(id: string, companyId: string, dto: UpdateUnitDto): Promise<Unit> {
        const unit = await this.findOneUnit(id, companyId);
        Object.assign(unit, dto);
        return this.unitRepository.save(unit);
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
            return { created: 0, failed: 0, errors: ['CSV content is required and must be a string'] };
        }

        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) {
            return { created: 0, failed: 0, errors: ['CSV must have a header row and at least one data row'] };
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const results = { created: 0, failed: 0, errors: [] as string[] };
        const unitsToCreate: Unit[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map((v) => v.trim());
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

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

    async getAssetOccupancy(companyId: string) {
        const results = await this.unitRepository
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
            .addGroupBy('a.name')
            .getRawMany();

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

    // Listings
    async createListing(companyId: string, dto: CreateListingDto): Promise<Listing> {
        const listing = this.listingRepository.create({ ...dto, companyId });
        return this.listingRepository.save(listing);
    }

    async findAllListings(companyId: string, page = 1, limit = 20) {
        const [data, total] = await this.listingRepository.findAndCount({
            where: { companyId },
            relations: ['unit'],
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOneListing(id: string, companyId: string): Promise<Listing> {
        const listing = await this.listingRepository.findOne({
            where: { id, companyId },
            relations: ['unit'],
        });
        if (!listing) throw new NotFoundException('Listing not found');
        return listing;
    }

    async updateListing(id: string, companyId: string, dto: UpdateListingDto): Promise<Listing> {
        const listing = await this.findOneListing(id, companyId);
        if (dto.status === ListingStatus.ACTIVE && !listing.publishedAt) {
            listing.publishedAt = new Date();
        }
        Object.assign(listing, dto);
        return this.listingRepository.save(listing);
    }

    async removeListing(id: string, companyId: string): Promise<void> {
        const listing = await this.findOneListing(id, companyId);
        await this.listingRepository.remove(listing);
    }
}
