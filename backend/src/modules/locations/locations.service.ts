import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { City } from './entities/city.entity';
import { Locality } from './entities/locality.entity';
import { SearchCityDto } from './dto/search-city.dto';
import { SearchLocalityDto } from './dto/search-locality.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateLocalityDto } from './dto/create-locality.dto';
import { getRegionByCode } from '../../shared/constants/regions';

export interface CitySearchResult {
    id: string;
    name: string;
    regionCode: string;
    country: string;
    score: number;
}

export interface LocalitySearchResult {
    id: string;
    name: string;
    cityId: string;
    score: number;
}

function sanitizeName(input: string): string {
    return input.trim().replace(/\s+/g, ' ');
}

@Injectable()
export class LocationsService {
    constructor(
        @InjectRepository(City)
        private readonly cityRepository: Repository<City>,
        @InjectRepository(Locality)
        private readonly localityRepository: Repository<Locality>,
        private readonly dataSource: DataSource,
    ) { }

    async searchCities(dto: SearchCityDto): Promise<CitySearchResult[]> {
        const results = await this.dataSource.query(
            `SELECT id, name, region_code AS "regionCode", country, similarity(name, $1) AS score
             FROM cities
             WHERE region_code = $2
               AND similarity(name, $1) > 0.3
             ORDER BY score DESC
             LIMIT 5`,
            [dto.q, dto.regionCode],
        );
        return results;
    }

    async searchLocalities(dto: SearchLocalityDto): Promise<LocalitySearchResult[]> {
        const results = await this.dataSource.query(
            `SELECT id, name, city_id AS "cityId", similarity(name, $1) AS score
             FROM localities
             WHERE city_id = $2
               AND similarity(name, $1) > 0.3
             ORDER BY score DESC
             LIMIT 5`,
            [dto.q, dto.cityId],
        );
        return results;
    }

    async createCity(dto: CreateCityDto, companyId: string): Promise<City> {
        const region = getRegionByCode(dto.regionCode);
        if (!region) {
            throw new BadRequestException(`Invalid region code: ${dto.regionCode}`);
        }
        const city = this.cityRepository.create({
            name: sanitizeName(dto.name),
            regionCode: dto.regionCode,
            country: region.country,
            createdByCompanyId: companyId,
        });
        return this.cityRepository.save(city);
    }

    async createLocality(dto: CreateLocalityDto, companyId: string): Promise<Locality> {
        const city = await this.cityRepository.findOne({ where: { id: dto.cityId } });
        if (!city) {
            throw new NotFoundException(`City with ID ${dto.cityId} not found`);
        }
        const locality = this.localityRepository.create({
            name: sanitizeName(dto.name),
            cityId: dto.cityId,
            createdByCompanyId: companyId,
        });
        return this.localityRepository.save(locality);
    }

    async getCitiesByRegion(regionCode: string): Promise<City[]> {
        return this.cityRepository.find({
            where: { regionCode },
            order: { name: 'ASC' },
        });
    }

    async getLocalitiesByCity(cityId: string): Promise<Locality[]> {
        return this.localityRepository.find({
            where: { cityId },
            order: { name: 'ASC' },
        });
    }

    async getCompanyLocalities(companyId: string, regionCode?: string) {
        let query = `
            SELECT l.id, l.name, c.name AS "cityName", c.region_code AS "regionCode",
                   COUNT(DISTINCT b.id)::int AS "buildingCount",
                   COUNT(DISTINCT u.id)::int AS "unitCount"
            FROM localities l
            INNER JOIN cities c ON l.city_id = c.id
            INNER JOIN buildings b ON b.locality_id = l.id AND b.company_id = $1
            LEFT JOIN units u ON u.building_id = b.id AND u.company_id = $1
        `;
        const params: (string)[] = [companyId];

        if (regionCode) {
            query += ` WHERE c.region_code = $2`;
            params.push(regionCode);
        }

        query += ` GROUP BY l.id, l.name, c.name, c.region_code ORDER BY c.name ASC, l.name ASC`;

        return this.dataSource.query(query, params);
    }
}
