import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company, SubscriptionTier, TIER_LIMITS } from './entities/company.entity';
import { User, AuthProvider } from '../users/entities/user.entity';
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
        private readonly dataSource: DataSource,
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

    async findAll(page = 1, limit = 20): Promise<{ data: (Company & { usersCount: number; inactiveUsersCount: number })[]; total: number; page: number; limit: number }> {
        const [companies, total] = await this.companyRepository.findAndCount({
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });

        if (companies.length === 0) {
            return { data: [], total, page, limit };
        }

        const companyIds = companies.map(c => c.id);
        const [activeRows, inactiveRows] = await Promise.all([
            this.userRepository
                .createQueryBuilder('u')
                .select('u.companyId', 'companyId')
                .addSelect('COUNT(*)', 'count')
                .where('u.companyId IN (:...ids)', { ids: companyIds })
                .andWhere('u.isActive = true')
                .groupBy('u.companyId')
                .getRawMany<{ companyId: string; count: string }>(),
            this.userRepository
                .createQueryBuilder('u')
                .select('u.companyId', 'companyId')
                .addSelect('COUNT(*)', 'count')
                .where('u.companyId IN (:...ids)', { ids: companyIds })
                .andWhere('u.isActive = false')
                .groupBy('u.companyId')
                .getRawMany<{ companyId: string; count: string }>(),
        ]);

        const activeMap = new Map(activeRows.map(r => [r.companyId, parseInt(r.count, 10)]));
        const inactiveMap = new Map(inactiveRows.map(r => [r.companyId, parseInt(r.count, 10)]));
        const data = companies.map(c => ({
            ...c,
            usersCount: activeMap.get(c.id) ?? 0,
            inactiveUsersCount: inactiveMap.get(c.id) ?? 0,
        }));

        return { data, total, page, limit };
    }

    async findOne(id: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { id } });
        if (!company) {
            throw new NotFoundException(`Company with ID ${id} not found`);
        }
        return company;
    }

    async findOneWithAdminEmail(id: string): Promise<Company & { adminEmail: string | null; usersCount: number; inactiveUsersCount: number }> {
        const company = await this.findOne(id);
        const [admin, usersCount, inactiveUsersCount] = await Promise.all([
            this.userRepository.findOne({
                where: { companyId: id, role: Role.COMPANY_ADMIN, isActive: true },
                select: ['email'],
            }),
            this.userRepository.count({ where: { companyId: id, isActive: true } }),
            this.userRepository.count({ where: { companyId: id, isActive: false } }),
        ]);
        return { ...company, adminEmail: admin?.email ?? null, usersCount, inactiveUsersCount };
    }

    async update(id: string, dto: UpdateCompanyDto, role?: string): Promise<Company> {
        const company = await this.findOne(id);

        if (role === Role.SUPER_ADMIN) {
            // no restrictions
        } else if (role === Role.COMPANY_ADMIN || role === Role.ADMIN) {
            const superAdminOnlyFields = ['isActive', 'subscriptionTier', 'maxUsers', 'maxCountries', 'maxProperties', 'subscriptionExpiresAt'];
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

        // Enforce country limit — use stored company limit, but respect tier upgrade and explicit override
        if (dto.activeRegions) {
            const storedMaxCountries = company.maxCountries
                ?? (TIER_LIMITS[company.subscriptionTier] ?? TIER_LIMITS[SubscriptionTier.FREE]).maxCountries;
            const effectiveMaxCountries: number =
                ('maxCountries' in dto ? dto.maxCountries : undefined) ??
                (dto.subscriptionTier && dto.subscriptionTier !== company.subscriptionTier
                    ? (TIER_LIMITS[dto.subscriptionTier] ?? TIER_LIMITS[SubscriptionTier.FREE]).maxCountries
                    : storedMaxCountries);
            const uniqueCountries = new Set(
                dto.activeRegions.map(code => getRegionByCode(code)?.country).filter(Boolean),
            );
            if (uniqueCountries.size > effectiveMaxCountries) {
                throw new BadRequestException(
                    `Your plan allows up to ${effectiveMaxCountries} countr${effectiveMaxCountries === 1 ? 'y' : 'ies'}. Upgrade to add more.`,
                );
            }
        }

        // Cross-validate: defaultRegionCode must be in activeRegions
        const finalActiveRegions = dto.activeRegions ?? company.activeRegions;
        const finalDefaultRegion = dto.defaultRegionCode ?? company.defaultRegionCode;
        if (finalActiveRegions && finalDefaultRegion && !finalActiveRegions.includes(finalDefaultRegion)) {
            throw new BadRequestException('defaultRegionCode must be included in activeRegions');
        }

        if (dto.subscriptionTier && dto.subscriptionTier !== company.subscriptionTier) {
            const tierLimits = TIER_LIMITS[dto.subscriptionTier] || TIER_LIMITS[SubscriptionTier.FREE];
            if (!('maxUsers' in dto)) company.maxUsers = tierLimits.maxUsers;
            if (!('maxCountries' in dto)) company.maxCountries = tierLimits.maxCountries;
            if (!('maxProperties' in dto)) company.maxProperties = tierLimits.maxProperties;
        }

        const { subscriptionExpiresAt, ...rest } = dto;
        Object.assign(company, rest);
        if ('subscriptionExpiresAt' in dto) {
            company.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
        }
        return this.companyRepository.save(company);
    }

    async findBySlug(slug: string): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { slug } });
        if (!company) {
            throw new NotFoundException(`Company with slug ${slug} not found`);
        }
        return company;
    }

    async createGoogleCompanyAdmin(dto: {
        companyName: string;
        slug: string;
        regionCode: string;
        googleId: string;
        email: string;
        name: string;
    }): Promise<Pick<User, 'id' | 'name' | 'email' | 'role' | 'companyId'>> {
        this.validateRegionCode(dto.regionCode);

        try {
            return await this.dataSource.transaction(async (manager) => {
                const companyRepo = manager.getRepository(Company);
                const userRepo = manager.getRepository(User);

                const existingSlug = await companyRepo.findOne({
                    where: { slug: dto.slug },
                    select: { id: true },
                });
                if (existingSlug) {
                    throw new ConflictException(
                        'This company name is already taken. Please choose a different one.',
                    );
                }

                const company = companyRepo.create({
                    name: dto.companyName,
                    slug: dto.slug,
                    defaultRegionCode: dto.regionCode,
                    activeRegions: [dto.regionCode],
                });
                const savedCompany = await companyRepo.save(company);

                const user = userRepo.create({
                    googleId: dto.googleId,
                    email: dto.email,
                    name: dto.name,
                    authProvider: AuthProvider.GOOGLE,
                    password: null,
                    role: Role.COMPANY_ADMIN,
                    companyId: savedCompany.id,
                });
                const savedUser = await userRepo.save(user);

                return {
                    id: savedUser.id,
                    name: savedUser.name,
                    email: savedUser.email,
                    role: savedUser.role,
                    companyId: savedCompany.id,
                };
            });
        } catch (error) {
            if (error instanceof ConflictException) {
                throw error;
            }
            if ((error as { code?: string })?.code === '23505') {
                throw new ConflictException(
                    'This company name is already taken. Please choose a different one.',
                );
            }
            throw error;
        }
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
