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
  constructor(private readonly reportsService: ReportsService) { }

  @Get('dashboard')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Boss dashboard KPIs (COMPANY_ADMIN+)' })
  getDashboard(@Request() req: any) {
    return this.reportsService.getDashboardKpis(req.user.companyId);
  }

  @Get('agent-performance')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Agent performance report (COMPANY_ADMIN+)' })
  getAgentPerformance(@Request() req: any) {
    return this.reportsService.getAgentPerformance(req.user.companyId);
  }
}
