import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  create(@Body() dto: CreateLeadDto, @Request() req: AuthenticatedRequest) {
    return this.leadsService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all leads for company (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.leadsService.findAll(req.user.companyId, page, limit, regionCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.leadsService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto, @Request() req: AuthenticatedRequest) {
    return this.leadsService.update(id, req.user.companyId, dto, req.user.userId);
  }

  @Post(':id/assign')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Assign lead to an agent (COMPANY_ADMIN+)' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignLeadDto, @Request() req: AuthenticatedRequest) {
    return this.leadsService.assign(id, req.user.companyId, dto.agentId, req.user.userId, dto.reason);
  }

  @Post(':id/convert')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Convert lead to WON status (COMPANY_ADMIN+)' })
  convert(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.leadsService.convert(id, req.user.companyId, req.user.userId);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Add activity to lead' })
  addActivity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLeadActivityDto, @Request() req: AuthenticatedRequest) {
    return this.leadsService.addActivity(id, req.user.companyId, dto, req.user.userId);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Get all activities for a lead' })
  findActivities(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.leadsService.findActivities(id, req.user.companyId);
  }
}
