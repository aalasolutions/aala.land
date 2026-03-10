import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeasesService } from './leases.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('leases')
@Controller('leases')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) { }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a lease agreement (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateLeaseDto, @Request() req: any) {
    return this.leasesService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List lease agreements (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.leasesService.findAll(req.user.companyId, page, limit);
  }

  @Get('unit/:unitId')
  @ApiOperation({ summary: 'Get all leases for a specific unit' })
  findByUnit(@Param('unitId') unitId: string, @Request() req: any) {
    return this.leasesService.findByUnit(unitId, req.user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lease by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.leasesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a lease (COMPANY_ADMIN+)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaseDto, @Request() req: any) {
    return this.leasesService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lease (COMPANY_ADMIN+)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.leasesService.remove(id, req.user.companyId);
  }
}
