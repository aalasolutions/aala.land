import { Controller, Get, Delete, Param, Query, UseGuards, Request, ParseUUIDPipe, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all audit logs for company' })
  async findAll(@Request() req: { user: { companyId: string } }, @Query() query: QueryAuditLogsDto) {
    return this.auditService.findAll(req.user.companyId, query);
  }

  @Delete('purge')
  @Roles(Role.COMPANY_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Purge audit logs older than N days (minimum 30)' })
  @ApiQuery({ name: 'olderThanDays', required: false, type: Number, description: 'Delete logs older than this many days (min 30, default 90)' })
  async purge(
    @Request() req: { user: { companyId: string } },
    @Query('olderThanDays', new DefaultValuePipe(90), ParseIntPipe) olderThanDays: number,
  ) {
    return this.auditService.purge(req.user.companyId, olderThanDays);
  }

  @Get(':id')
  @Roles(Role.COMPANY_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get single audit log by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: { companyId: string } }) {
    return this.auditService.findOne(id, req.user.companyId);
  }
}
