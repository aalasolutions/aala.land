import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { REGIONS } from '@shared/constants/regions';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) { }

    @Get('regions')
    @ApiOperation({ summary: 'Get all supported regions (public, no auth)' })
    getRegions() {
        return REGIONS;
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
    @ApiOperation({ summary: 'Get company by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        // Users can only view their own company, SUPER_ADMIN can view any
        if (req.user.role !== Role.SUPER_ADMIN && req.user.companyId !== id) {
            throw new ForbiddenException('You do not have access to this company');
        }
        return this.companiesService.findOne(id);
    }

    @Patch(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Update company' })
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateCompanyDto, @Request() req: AuthenticatedRequest) {
        // Users can only update their own company, SUPER_ADMIN can update any
        if (req.user.role !== Role.SUPER_ADMIN && req.user.companyId !== id) {
            throw new ForbiddenException('You do not have access to this company');
        }
        return this.companiesService.update(id, updateDto);
    }
}
