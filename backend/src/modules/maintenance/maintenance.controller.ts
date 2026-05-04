import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('maintenance')
@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) { }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a maintenance work order (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateWorkOrderDto, @Request() req: AuthenticatedRequest) {
    return this.maintenanceService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List work orders (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'period', required: false, enum: ['this_month', 'last_month', 'last_3_months'] })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('period') period?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.maintenanceService.findAll(req.user.companyId, page, limit, regionCode, status, period);
  }

  @Get('cost-summary')
  @ApiOperation({ summary: 'Get cost summary for all work orders' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getCostSummary(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.maintenanceService.getCostSummary(req.user.companyId, regionCode);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get preventive maintenance due in next 30 days' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getUpcoming(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.maintenanceService.getUpcoming(req.user.companyId, regionCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a work order by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.maintenanceService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a work order (COMPANY_ADMIN+)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkOrderDto, @Request() req: AuthenticatedRequest) {
    return this.maintenanceService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a work order (COMPANY_ADMIN+)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.maintenanceService.remove(id, req.user.companyId);
  }
}
