import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) { }

    @Post()
    @Roles(Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'Create a new company (tenant) - SUPER_ADMIN only' })
    create(@Body() createDto: CreateCompanyDto) {
        return this.companiesService.create(createDto);
    }

    @Get()
    @ApiOperation({ summary: 'List all companies (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.companiesService.findAll(page, limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get company by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.companiesService.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update company' })
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateCompanyDto) {
        return this.companiesService.update(id, updateDto);
    }
}
