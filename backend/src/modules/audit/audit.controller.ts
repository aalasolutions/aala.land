import { Controller, Get, Param, Query, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
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
  async findAll(@Request() req, @Query() query: QueryAuditLogsDto) {
    const result = await this.auditService.findAll(req.user.companyId, query);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @Roles(Role.COMPANY_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get single audit log by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    const auditLog = await this.auditService.findOne(id, req.user.companyId);
    return {
      success: true,
      data: auditLog,
    };
  }
}
