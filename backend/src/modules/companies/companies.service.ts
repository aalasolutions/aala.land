import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, SubscriptionTier, TIER_LIMITS } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { REGIONS, getRegionByCode } from '@shared/constants/regions';
import { paginationOptions } from '../../shared/utils/pagination.util';

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
    ) { }

    async create(dto: CreateCompanyDto): Promise<Company> {
        this.validateRegionCode(dto.defaultRegionCode);

        // If activeRegions not provided, default to [defaultRegionCode]
        if (!dto.activeRegions) {
            dto.activeRegions = [dto.defaultRegionCode];
        } else {
            this.validateRegionCodes(dto.activeRegions);
            if (!dto.activeRegions.includes(dto.defaultRegionCode)) {
                throw new BadRequestException('defaultRegionCode must be included in activeRegions');
            }
        }

        const company = this.companyRepository.create(dto);
        return this.companyRepository.save(company);
    }

    async findAll(page = 1, limit = 20): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
        const [data, total] = await this.companyRepository.findAndCount({
            ...paginationOptions(page, limit),
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

        // Enforce country limit based on subscription tier
        if (dto.activeRegions) {
            const limits = TIER_LIMITS[company.subscriptionTier] || TIER_LIMITS[SubscriptionTier.FREE];
            const uniqueCountries = new Set(
                dto.activeRegions.map(code => getRegionByCode(code)?.country).filter(Boolean),
            );
            if (uniqueCountries.size > limits.maxCountries) {
                throw new BadRequestException(
                    `Your ${company.subscriptionTier} plan allows up to ${limits.maxCountries} country. Upgrade to add more.`,
                );
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

    async findBySlug(slug: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { slug } });
        if (!company) {
            throw new NotFoundException(`Company with slug ${slug} not found`);
        }
        return company;
    }

    private validateRegionCode(code: string): void {
        const valid = REGIONS.some(r => r.code === code);
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
