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
import { normalizedNameSql, normalizedNameWhere, sanitizeName, isUniqueViolation } from '../../shared/utils/name-normalization.util';

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
        const query = sanitizeName(dto.q);
        if (!query) {
            return [];
        }
        const results = await this.dataSource.query(
            `SELECT *
             FROM (
                 SELECT DISTINCT ON (${normalizedNameSql('name')})
                     id,
                     name,
                     region_code AS "regionCode",
                     country,
                     similarity(name, $1) AS score
                 FROM cities
                 WHERE region_code = $2
                   AND similarity(name, $1) > 0.3
                 ORDER BY ${normalizedNameSql('name')}, score DESC, name ASC
             ) deduped
             ORDER BY score DESC, name ASC
             LIMIT 5`,
            [query, dto.regionCode],
        );
        return results;
    }

    async searchLocalities(dto: SearchLocalityDto): Promise<LocalitySearchResult[]> {
        const query = sanitizeName(dto.q);
        if (!query) {
            return [];
        }
        const results = await this.dataSource.query(
            `SELECT *
             FROM (
                 SELECT DISTINCT ON (${normalizedNameSql('name')})
                     id,
                     name,
                     city_id AS "cityId",
                     similarity(name, $1) AS score
                 FROM localities
                 WHERE city_id = $2
                   AND similarity(name, $1) > 0.3
                 ORDER BY ${normalizedNameSql('name')}, score DESC, name ASC
             ) deduped
             ORDER BY score DESC, name ASC
             LIMIT 5`,
            [query, dto.cityId],
        );
        return results;
    }

    async createCity(dto: CreateCityDto, companyId: string): Promise<City> {
        const sanitizedName = sanitizeName(dto.name);
        if (!sanitizedName) {
            throw new BadRequestException('City name is required and cannot be empty or whitespace-only');
        }
        const region = getRegionByCode(dto.regionCode);
        if (!region) {
            throw new BadRequestException(`Invalid region code: ${dto.regionCode}`);
        }
        const existing = await this.cityRepository.findOne({
            where: {
                regionCode: dto.regionCode,
                name: normalizedNameWhere(sanitizedName),
            },
        });
        if (existing) {
            return existing;
        }
        const city = this.cityRepository.create({
            name: sanitizedName,
            regionCode: dto.regionCode,
            country: region.country,
            createdByCompanyId: companyId,
        });
        try {
            return await this.cityRepository.save(city);
        } catch (error) {
            if (isUniqueViolation(error)) {
                const duplicate = await this.cityRepository.findOne({
                    where: {
                        regionCode: dto.regionCode,
                        name: normalizedNameWhere(sanitizedName),
                    },
                });
                if (duplicate) {
                    return duplicate;
                }
            }

            throw error;
        }
    }

    async createLocality(dto: CreateLocalityDto, companyId: string): Promise<Locality> {
        const sanitizedName = sanitizeName(dto.name);
        if (!sanitizedName) {
            throw new BadRequestException('Locality name is required and cannot be empty or whitespace-only');
        }
        const city = await this.cityRepository.findOne({ where: { id: dto.cityId } });
        if (!city) {
            throw new NotFoundException(`City with ID ${dto.cityId} not found`);
        }
        const existing = await this.localityRepository.findOne({
            where: {
                cityId: dto.cityId,
                name: normalizedNameWhere(sanitizedName),
            },
        });
        if (existing) {
            return existing;
        }
        const locality = this.localityRepository.create({
            name: sanitizedName,
            cityId: dto.cityId,
            createdByCompanyId: companyId,
        });
        try {
            return await this.localityRepository.save(locality);
        } catch (error) {
            if (isUniqueViolation(error)) {
                const duplicate = await this.localityRepository.findOne({
                    where: {
                        cityId: dto.cityId,
                        name: normalizedNameWhere(sanitizedName),
                    },
                });
                if (duplicate) {
                    return duplicate;
                }
            }

            throw error;
        }
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
                   COUNT(DISTINCT ast.id)::int AS "assetCount",
                   COUNT(DISTINCT u.id)::int AS "unitCount"
            FROM localities l
            INNER JOIN cities c ON l.city_id = c.id
            INNER JOIN buildings ast ON ast.locality_id = l.id
            LEFT JOIN units u ON u.building_id = ast.id AND u.company_id = $1
            WHERE (u.company_id = $1 OR ast.company_id = $1)
        `;
        const params: (string)[] = [companyId];

        if (regionCode) {
            query += ` AND c.region_code = $2`;
            params.push(regionCode);
        }

        query += ` GROUP BY l.id, l.name, c.name, c.region_code ORDER BY c.name ASC, l.name ASC`;

        return this.dataSource.query(query, params);
    }
}
