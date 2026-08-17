import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LeasesService } from './leases.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeaseStatus, LeaseType } from './entities/lease.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('leases')
@Controller('leases')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a lease agreement (ADMIN+)' })
  create(@Body() dto: CreateLeaseDto, @Request() req: AuthenticatedRequest) {
    return this.leasesService.create(requireCompanyId(req.user), dto);
  }

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List lease agreements (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  @ApiQuery({
    name: 'contactId',
    required: false,
    type: String,
    description: 'All leases (as tenant) for this contact',
  })
  @ApiQuery({ name: 'status', required: false, enum: LeaseStatus })
  @ApiQuery({ name: 'type', required: false, enum: LeaseType })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Matches tenant name, unit number or Ejari number',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'ISO date, inclusive lower bound on startDate',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'ISO date, inclusive upper bound on startDate',
  })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('regionCode') regionCode?: string,
    @Query('contactId', new ParseUUIDPipe({ optional: true }))
    contactId?: string,
    @Query('status') status?: LeaseStatus,
    @Query('type') type?: LeaseType,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    if (req.user.role === Role.AGENT && !contactId) {
      throw new ForbiddenException(
        'Agents must filter leases by contactId',
      );
    }
    if (dateFrom && isNaN(Date.parse(dateFrom))) {
      throw new BadRequestException('dateFrom is not a valid date');
    }
    if (dateTo && isNaN(Date.parse(dateTo))) {
      throw new BadRequestException('dateTo is not a valid date');
    }
    return this.leasesService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      regionCode,
      contactId,
      {
        status: status || undefined,
        type: type || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
    );
  }

  @Get('unit/:unitId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get all leases for a specific unit' })
  findByUnit(
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.findByUnit(unitId, requireCompanyId(req.user));
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get a lease by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.findOne(id, requireCompanyId(req.user));
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a lease (ADMIN+)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.update(id, requireCompanyId(req.user), dto);
  }

  @Post(':id/renew')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Renew a lease (creates new lease, marks old as RENEWED)',
  })
  renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeaseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.renew(id, requireCompanyId(req.user), dto);
  }

  @Post(':id/terminate')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Terminate a lease early' })
  terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.terminate(id, requireCompanyId(req.user));
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lease (COMPANY_ADMIN+)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.remove(id, requireCompanyId(req.user));
  }
}
