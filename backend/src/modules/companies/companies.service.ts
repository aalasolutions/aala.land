import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Company, SubscriptionTier } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { MENA_REGIONS } from '@shared/constants/regions';

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
        private readonly dataSource: DataSource,
    ) { }

    async create(dto: CreateCompanyDto): Promise<Company> {
        if (dto.activeRegions) {
            this.validateRegionCodes(dto.activeRegions);
        }
        if (dto.defaultRegionCode) {
            this.validateRegionCode(dto.defaultRegionCode);
            if (dto.activeRegions && !dto.activeRegions.includes(dto.defaultRegionCode)) {
                throw new BadRequestException('defaultRegionCode must be included in activeRegions');
            }
        }
        const company = this.companyRepository.create(dto);
        return this.companyRepository.save(company);
    }

    async findAll(page = 1, limit = 20): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
        const [data, total] = await this.companyRepository.findAndCount({
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOne(id: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { id } });
        if (!company) {
            throw new NotFoundException(`Company with ID ${id} not found`);
        }
        return company;
    }

    async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
        const company = await this.findOne(id);

        if (dto.activeRegions) {
            this.validateRegionCodes(dto.activeRegions);
        }
        if (dto.defaultRegionCode) {
            this.validateRegionCode(dto.defaultRegionCode);
        }

        // FREE plan: block region change if entities exist in current region
        if (
            company.subscriptionTier === SubscriptionTier.FREE &&
            dto.activeRegions &&
            !this.arraysEqual(dto.activeRegions, company.activeRegions)
        ) {
            const currentRegion = company.activeRegions[0];
            if (currentRegion) {
                const hasData = await this.hasEntitiesInRegion(id, currentRegion);
                if (hasData) {
                    throw new BadRequestException(
                        'Cannot change region while properties exist. Delete all properties in your current region first.',
                    );
                }
            }
        }

        // Cross-validate: defaultRegionCode must be in activeRegions
        const finalActiveRegions = dto.activeRegions ?? company.activeRegions;
        const finalDefaultRegion = dto.defaultRegionCode ?? company.defaultRegionCode;
        if (!finalActiveRegions.includes(finalDefaultRegion)) {
            throw new BadRequestException('defaultRegionCode must be included in activeRegions');
        }

        Object.assign(company, dto);
        return this.companyRepository.save(company);
    }

    private arraysEqual(a: string[], b: string[]): boolean {
        if (a.length !== b.length) return false;
        const sorted1 = [...a].sort();
        const sorted2 = [...b].sort();
        return sorted1.every((v, i) => v === sorted2[i]);
    }

    private async hasEntitiesInRegion(companyId: string, regionCode: string): Promise<boolean> {
        const result = await this.dataSource.query(
            `SELECT EXISTS(
                SELECT 1 FROM property_areas WHERE company_id = $1 AND region_code = $2
            ) AS has_data`,
            [companyId, regionCode],
        );
        return result[0]?.has_data === true;
    }

    async findBySlug(slug: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { slug } });
        if (!company) {
            throw new NotFoundException(`Company with slug ${slug} not found`);
        }
        return company;
    }

    private validateRegionCode(code: string): void {
        const valid = MENA_REGIONS.some(r => r.code === code);
        if (!valid) {
            throw new BadRequestException(`Invalid region code: ${code}`);
        }
    }

    private validateRegionCodes(codes: string[]): void {
        for (const code of codes) {
            this.validateRegionCode(code);
        }
    }
}
