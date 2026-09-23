import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  ReportsService,
  Achievement,
  ActivityFeedPage,
  AgentComparison,
  AgentPerformance,
  AgentResponseTime,
  DashboardKpis,
  LeadOwnership,
  PipelineFunnel,
  RedFlagCheck,
  RevenueTrendPoint,
  StageBottleneck,
} from './reports.service';
import { QueryReportsDto } from './dto/query-reports.dto';
import { QueryActivityFeedDto } from './dto/query-activity-feed.dto';
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
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Boss dashboard KPIs' })
  getDashboard(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<DashboardKpis> {
    return this.reportsService.getDashboardKpis(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('revenue-trend')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Completed income per month, last 6 months' })
  getRevenueTrend(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<RevenueTrendPoint[]> {
    return this.reportsService.getRevenueTrend(
      requireCompanyId(req.user),
      6,
      query.regionCode,
      req.user,
    );
  }

  @Get('agent-performance')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Agent performance report' })
  getAgentPerformance(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<AgentPerformance[]> {
    return this.reportsService.getAgentPerformance(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('red-flags')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Red flag alerts for boss' })
  getRedFlags(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<RedFlagCheck[]> {
    return this.reportsService.getRedFlags(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('activity-feed')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Recent activity feed' })
  getActivityFeed(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryActivityFeedDto,
  ): Promise<ActivityFeedPage> {
    return this.reportsService.getActivityFeed(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
      query.page,
      query.limit,
    );
  }

  @Get('pipeline-funnel')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Lead pipeline funnel counts' })
  getPipelineFunnel(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<PipelineFunnel[]> {
    return this.reportsService.getPipelineFunnel(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('lead-ownership')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Open lead load per agent, plus the unassigned open count',
  })
  getLeadOwnership(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<LeadOwnership> {
    return this.reportsService.getLeadOwnership(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('bottlenecks')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Pipeline bottleneck identification: avg days per stage',
  })
  getBottlenecks(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<StageBottleneck[]> {
    return this.reportsService.getBottlenecks(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('response-times')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary:
      'Agent response time metrics: avg minutes from lead creation to first status change',
  })
  getResponseTimes(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<AgentResponseTime[]> {
    return this.reportsService.getResponseTimeMetrics(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('achievements')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Team achievements: best converter, most wins, top earner',
  })
  getAchievements(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<Achievement[]> {
    return this.reportsService.getAchievements(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }

  @Get('agent-comparison')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Agent comparison with ranking' })
  getAgentComparison(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryReportsDto,
  ): Promise<AgentComparison[]> {
    return this.reportsService.getAgentComparison(
      requireCompanyId(req.user),
      query.regionCode,
      req.user,
    );
  }
}
