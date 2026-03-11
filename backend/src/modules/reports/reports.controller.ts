import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Boss dashboard KPIs' })
  getDashboard(@Request() req: any) {
    return this.reportsService.getDashboardKpis(req.user.companyId);
  }

  @Get('agent-performance')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Agent performance report' })
  getAgentPerformance(@Request() req: any) {
    return this.reportsService.getAgentPerformance(req.user.companyId);
  }

  @Get('red-flags')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Red flag alerts for boss' })
  getRedFlags(@Request() req: any) {
    return this.reportsService.getRedFlags(req.user.companyId);
  }

  @Get('activity-feed')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Recent activity feed' })
  getActivityFeed(@Request() req: any) {
    return this.reportsService.getActivityFeed(req.user.companyId);
  }

  @Get('pipeline-funnel')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Lead pipeline funnel counts' })
  getPipelineFunnel(@Request() req: any) {
    return this.reportsService.getPipelineFunnel(req.user.companyId);
  }

  @Get('bottlenecks')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Pipeline bottleneck identification: avg days per stage' })
  getBottlenecks(@Request() req: any) {
    return this.reportsService.getBottlenecks(req.user.companyId);
  }

  @Get('response-times')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Agent response time metrics: avg minutes from lead creation to first status change' })
  getResponseTimes(@Request() req: any) {
    return this.reportsService.getResponseTimeMetrics(req.user.companyId);
  }

  @Get('achievements')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Team achievements: best converter, most wins, top earner' })
  getAchievements(@Request() req: any) {
    return this.reportsService.getAchievements(req.user.companyId);
  }

  @Get('agent-comparison')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Agent comparison with ranking' })
  getAgentComparison(@Request() req: any) {
    return this.reportsService.getAgentComparison(req.user.companyId);
  }
}
