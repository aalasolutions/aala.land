import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Global search across properties and agents' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  async search(
    @Request() req: AuthenticatedRequest,
    @Query('q') q: string,
    @Query('regionCode') regionCode?: string,
  ) {
    const trimmed = q?.trim() ?? '';
    if (trimmed.length < 2 || trimmed.length > 100) {
      return { properties: [], agents: [] };
    }
    return await this.searchService.search(
      trimmed,
      requireCompanyId(req.user),
      regionCode,
    );
  }
}
