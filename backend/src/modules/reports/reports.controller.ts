import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Boss dashboard KPIs' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getDashboard(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getDashboardKpis(requireCompanyId(req.user), regionCode);
  }

  @Get('agent-performance')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Agent performance report' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getAgentPerformance(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getAgentPerformance(requireCompanyId(req.user), regionCode);
  }

  @Get('red-flags')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Red flag alerts for boss' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getRedFlags(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getRedFlags(requireCompanyId(req.user), regionCode);
  }

  @Get('activity-feed')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Recent activity feed' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getActivityFeed(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getActivityFeed(requireCompanyId(req.user), regionCode);
  }

  @Get('pipeline-funnel')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Lead pipeline funnel counts' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getPipelineFunnel(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getPipelineFunnel(requireCompanyId(req.user), regionCode);
  }

  @Get('bottlenecks')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Pipeline bottleneck identification: avg days per stage' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getBottlenecks(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getBottlenecks(requireCompanyId(req.user), regionCode);
  }

  @Get('response-times')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Agent response time metrics: avg minutes from lead creation to first status change' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getResponseTimes(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getResponseTimeMetrics(requireCompanyId(req.user), regionCode);
  }

  @Get('achievements')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Team achievements: best converter, most wins, top earner' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getAchievements(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getAchievements(requireCompanyId(req.user), regionCode);
  }

  @Get('agent-comparison')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Agent comparison with ranking' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getAgentComparison(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
    return this.reportsService.getAgentComparison(requireCompanyId(req.user), regionCode);
  }
}
