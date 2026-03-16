import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyArea } from './entities/property-area.entity';
import { Building } from './entities/building.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { Listing, ListingStatus } from './entities/listing.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

@Injectable()
export class PropertiesService {
    constructor(
        @InjectRepository(PropertyArea)
        private readonly areaRepository: Repository<PropertyArea>,
        @InjectRepository(Building)
        private readonly buildingRepository: Repository<Building>,
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
        const where: any = { companyId };
        if (regionCode) where.regionCode = regionCode;

        const [areas, total] = await this.areaRepository.findAndCount({
            where,
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' },
        });

        // Get building and unit counts for each area
        const areaIds = areas.map(a => a.id);
        const buildings = await this.buildingRepository
            .createQueryBuilder('b')
            .select('b.areaId', 'areaId')
            .addSelect('COUNT(*)', 'count')
            .where('b.areaId IN (:...areaIds)', { areaIds })
            .groupBy('b.areaId')
            .getRawMany();

        const units = await this.unitRepository
            .createQueryBuilder('u')
            .innerJoin('u.building', 'b')
            .select('b.areaId', 'areaId')
            .addSelect('COUNT(*)', 'count')
            .where('b.areaId IN (:...areaIds)', { areaIds })
            .groupBy('b.areaId')
            .getRawMany();

        const buildingCounts = Object.fromEntries(buildings.map(b => [b.areaId, parseInt(b.count)]));
        const unitCounts = Object.fromEntries(units.map(u => [u.areaId, parseInt(u.count)]));

        const data = areas.map(area => ({
            ...area,
            buildingCount: buildingCounts[area.id] || 0,
            unitCount: unitCounts[area.id] || 0,
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

    // Buildings
    async createBuilding(companyId: string, dto: CreateBuildingDto): Promise<Building> {
        const building = this.buildingRepository.create({ ...dto, companyId });
        return this.buildingRepository.save(building);
    }

    async findBuildingsByArea(areaId: string, companyId: string, page = 1, limit = 20) {
        const [data, total] = await this.buildingRepository.findAndCount({
            where: { areaId, companyId },
            relations: ['units'],
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOneBuilding(id: string, companyId: string): Promise<Building> {
        const building = await this.buildingRepository.findOne({ where: { id, companyId } });
        if (!building) throw new NotFoundException(`Building not found`);
        return building;
    }

    async updateBuilding(id: string, companyId: string, dto: UpdateBuildingDto): Promise<Building> {
        const building = await this.findOneBuilding(id, companyId);
        Object.assign(building, dto);
        return this.buildingRepository.save(building);
    }

    async removeBuilding(id: string, companyId: string): Promise<void> {
        const building = await this.findOneBuilding(id, companyId);
        await this.buildingRepository.remove(building);
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
            .innerJoin('u.building', 'b')
            .innerJoin('b.area', 'a')
            .leftJoin('u.owner', 'o')
            .addSelect(['b.id', 'b.name', 'b.propertyType', 'a.id', 'a.name', 'o.id', 'o.name'])
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
            qb.andWhere('a.regionCode = :regionCode', { regionCode: filters.regionCode });
        }

        qb.skip((page - 1) * limit)
            .take(limit)
            .orderBy('a.name', 'ASC')
            .addOrderBy('b.name', 'ASC')
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
            propertyType: u.propertyType ?? u.building?.propertyType ?? null,
            amenities: u.amenities,
            photos: u.photos,
            floor: u.floor,
            buildingId: u.buildingId,
            buildingName: u.building?.name ?? '',
            areaId: u.building?.area?.id ?? '',
            areaName: u.building?.area?.name ?? '',
            ownerName: u.owner?.name ?? null,
        }));

        return { data, total, page, limit };
    }

    async createUnit(companyId: string, dto: CreateUnitDto): Promise<Unit> {
        const unit = this.unitRepository.create({ ...dto, companyId });
        return this.unitRepository.save(unit);
    }

    async findUnitsByBuilding(buildingId: string, companyId: string, page = 1, limit = 20) {
        const [data, total] = await this.unitRepository.findAndCount({
            where: { buildingId, companyId },
            relations: ['owner'],
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOneUnit(id: string, companyId: string): Promise<Unit> {
        const unit = await this.unitRepository.findOne({
            where: { id, companyId },
            relations: ['building', 'building.area', 'owner'],
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
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) {
            return { created: 0, failed: 0, errors: ['CSV must have a header row and at least one data row'] };
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const results = { created: 0, failed: 0, errors: [] as string[] };

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map((v) => v.trim());
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

            if (!row['unitnumber'] || !row['buildingid']) {
                results.failed++;
                results.errors.push(`Row ${i}: unitNumber and buildingId are required`);
                continue;
            }

            try {
                const sqFt = parseFloat(row['sqft'] || '0') || undefined;
                const price = parseFloat(row['price'] || '0') || undefined;
                const unit = this.unitRepository.create({
                    companyId,
                    unitNumber: row['unitnumber'],
                    buildingId: row['buildingid'],
                    bedrooms: parseInt(row['bedrooms'] || '0', 10),
                    bathrooms: parseInt(row['bathrooms'] || '0', 10),
                    sqFt,
                    price,
                    status: (row['status'] as any) || 'available',
                });
                await this.unitRepository.save(unit);
                results.created++;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                results.failed++;
                results.errors.push(`Row ${i}: ${message}`);
            }
        }

        return results;
    }

    async getBuildingOccupancy(companyId: string) {
        const results = await this.unitRepository
            .createQueryBuilder('u')
            .innerJoin('u.building', 'b')
            .select('b.id', 'buildingId')
            .addSelect('b.name', 'buildingName')
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
            .groupBy('b.id')
            .addGroupBy('b.name')
            .getRawMany();

        return results.map((r) => ({
            buildingId: r.buildingId,
            buildingName: r.buildingName,
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
            skip: (page - 1) * limit,
            take: limit,
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
