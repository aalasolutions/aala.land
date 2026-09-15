import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecordHistoryService } from './record-history.service';
import { QueryRecordHistoryDto } from './dto/query-record-history.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('record-history')
@ApiBearerAuth()
@Controller('record-history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordHistoryController {
  constructor(private readonly recordHistoryService: RecordHistoryService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get record history for company' })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryRecordHistoryDto,
  ) {
    return this.recordHistoryService.findAll(
      requireCompanyId(req.user),
      query,
      req.user.role,
    );
  }
}
