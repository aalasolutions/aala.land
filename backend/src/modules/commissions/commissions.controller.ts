import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CommissionsService } from './commissions.service';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('commissions')
@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a commission record (ADMIN+)' })
  create(
    @Body() dto: CreateCommissionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.commissionsService.create(requireCompanyId(req.user), dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List commissions (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.commissionsService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      status,
      regionCode,
    );
  }

  @Get('agent/:agentId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List commissions for a specific agent' })
  findByAgent(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.commissionsService.findByAgent(
      agentId,
      requireCompanyId(req.user),
      page,
      limit,
    );
  }

  @Get('agent/:agentId/summary')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get commission summary for an agent' })
  getSummary(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.commissionsService.getSummary(
      agentId,
      requireCompanyId(req.user),
    );
  }

  @Post(':id/approve')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Approve a commission (ADMIN+)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.commissionsService.approve(id, requireCompanyId(req.user));
  }

  @Post(':id/pay')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Mark commission as paid (ADMIN+)' })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.commissionsService.pay(id, requireCompanyId(req.user));
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get a commission by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.commissionsService.findOne(id, requireCompanyId(req.user));
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update commission status (ADMIN+)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.commissionsService.update(id, requireCompanyId(req.user), dto);
  }
}
