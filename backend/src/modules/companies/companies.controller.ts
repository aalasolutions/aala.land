import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { REGIONS, getRegionsGroupedByCountry } from '@shared/constants/regions';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';
import { getStorageQuotaBytes } from '@shared/utils/storage-quota.util';

interface StorageUsageResponse {
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
  tier: string;
  purchasedSeats: number;
}

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) { }

    @Get('regions')
    @ApiOperation({ summary: 'Get all supported regions grouped by country (public, no auth)' })
    getRegions() {
        return { flat: REGIONS, grouped: getRegionsGroupedByCountry() };
    }

    @Post()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'Create a new company (tenant) - SUPER_ADMIN only' })
    create(@Body() createDto: CreateCompanyDto) {
        return this.companiesService.create(createDto);
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'List all companies (paginated) - SUPER_ADMIN only' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.companiesService.findAll(page, limit);
    }

    @Get(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'Get company by ID' })
    async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        // Users can only view their own company, SUPER_ADMIN can view any
        if (req.user.role !== Role.SUPER_ADMIN && requireCompanyId(req.user) !== id) {
            throw new ForbiddenException('You do not have access to this company');
        }
        const result = await this.companiesService.findOneWithAdminEmail(id);
        const canSeeAdminEmail = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN].includes(req.user.role as Role);
        if (!canSeeAdminEmail) {
            const { adminEmail: _adminEmail, ...rest } = result;
            return rest;
        }
        return result;
    }

    @Get(':id/storage-usage')
    @ApiOperation({
        summary:
            'Return storage usage for a company. ' +
            'Own company or SUPER_ADMIN only.',
    })
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    async getStorageUsage(
        @Param('id', ParseUUIDPipe) id: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<StorageUsageResponse> {
        if (req.user.role !== Role.SUPER_ADMIN && requireCompanyId(req.user) !== id) {
            throw new ForbiddenException('Access denied');
        }
        const company = await this.companiesService.findOne(id);
        const usedBytes = Number(company.storageUsedBytes ?? 0);
        const quotaBytes = getStorageQuotaBytes(company);
        const percentUsed =
            quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

        return {
            usedBytes,
            quotaBytes,
            percentUsed,
            tier: company.subscriptionTier,
            purchasedSeats: company.purchasedSeats ?? 1,
        };
    }

    @Patch(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @ApiOperation({ summary: 'Update company' })
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateCompanyDto, @Request() req: AuthenticatedRequest) {
        // Users can only update their own company, SUPER_ADMIN can update any
        if (req.user.role !== Role.SUPER_ADMIN && requireCompanyId(req.user) !== id) {
            throw new ForbiddenException('You do not have access to this company');
        }
        return this.companiesService.update(id, updateDto, req.user.role);
    }
}
