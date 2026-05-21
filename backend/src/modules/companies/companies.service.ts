import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, SubscriptionTier, TIER_LIMITS } from './entities/company.entity';
import { User } from '../users/entities/user.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { REGIONS, getRegionByCode } from '@shared/constants/regions';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { Role } from '@shared/enums/roles.enum';

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
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

    async findAll(page = 1, limit = 20): Promise<{ data: (Company & { usersCount: number })[]; total: number; page: number; limit: number }> {
        const [companies, total] = await this.companyRepository.findAndCount({
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });

        if (companies.length === 0) {
            return { data: [], total, page, limit };
        }

        const companyIds = companies.map(c => c.id);
        const countRows = await this.userRepository
            .createQueryBuilder('u')
            .select('u.companyId', 'companyId')
            .addSelect('COUNT(*)', 'count')
            .where('u.companyId IN (:...ids)', { ids: companyIds })
            .groupBy('u.companyId')
            .getRawMany<{ companyId: string; count: string }>();

        const countMap = new Map(countRows.map(r => [r.companyId, parseInt(r.count, 10)]));
        const data = companies.map(c => ({ ...c, usersCount: countMap.get(c.id) ?? 0 }));

        return { data, total, page, limit };
    }

    async findOne(id: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { id } });
        if (!company) {
            throw new NotFoundException(`Company with ID ${id} not found`);
        }
        return company;
    }

    async findOneWithAdminEmail(id: string): Promise<Company & { email: string | null; usersCount: number }> {
        const company = await this.findOne(id);
        const [admin, usersCount] = await Promise.all([
            this.userRepository.findOne({
                where: { companyId: id, role: Role.COMPANY_ADMIN },
                select: ['email'],
            }),
            this.userRepository.count({ where: { companyId: id } }),
        ]);
        return { ...company, email: admin?.email ?? null, usersCount };
    }

    async update(id: string, dto: UpdateCompanyDto, role?: string): Promise<Company> {
        const company = await this.findOne(id);

        if (role === Role.SUPER_ADMIN) {
            // no restrictions
        } else if (role === Role.COMPANY_ADMIN || role === Role.ADMIN) {
            const superAdminOnlyFields = ['subscriptionTier', 'maxUsers', 'maxCountries', 'maxProperties', 'subscriptionExpiresAt'];
            const attempted = superAdminOnlyFields.filter(f => f in dto);
            if (attempted.length) {
                throw new ForbiddenException(`You are not allowed to update: ${attempted.join(', ')}`);
            }
        } else {
            const restrictedFields = ['activeRegions', 'defaultRegionCode', 'subscriptionTier', 'maxUsers', 'maxCountries', 'maxProperties', 'subscriptionExpiresAt'];
            const attempted = restrictedFields.filter(f => f in dto);
            if (attempted.length) {
                throw new ForbiddenException(`You are not allowed to update: ${attempted.join(', ')}`);
            }
        }

        if (dto.activeRegions) {
            this.validateRegionCodes(dto.activeRegions);
        }
        if (dto.defaultRegionCode) {
            this.validateRegionCode(dto.defaultRegionCode);
        }

        // Enforce country limit based on subscription tier
        if (dto.activeRegions) {
            const effectiveTier = dto.subscriptionTier ?? company.subscriptionTier;
            const limits = TIER_LIMITS[effectiveTier] || TIER_LIMITS[SubscriptionTier.FREE];
            const uniqueCountries = new Set(
                dto.activeRegions.map(code => getRegionByCode(code)?.country).filter(Boolean),
            );
            if (uniqueCountries.size > limits.maxCountries) {
                throw new BadRequestException(
                    `Your ${effectiveTier} plan allows up to ${limits.maxCountries} country. Upgrade to add more.`,
                );
            }
        }

        // Cross-validate: defaultRegionCode must be in activeRegions
        const finalActiveRegions = dto.activeRegions ?? company.activeRegions;
        const finalDefaultRegion = dto.defaultRegionCode ?? company.defaultRegionCode;
        if (finalActiveRegions && finalDefaultRegion && !finalActiveRegions.includes(finalDefaultRegion)) {
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
