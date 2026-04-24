import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
    constructor(private readonly searchService: SearchService) {}

    @Get()
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
            return { data: { properties: [], agents: [] } };
        }
        return { data: await this.searchService.search(trimmed, req.user.companyId, regionCode) };
    }
}
