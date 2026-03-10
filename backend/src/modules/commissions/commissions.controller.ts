import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommissionsService } from './commissions.service';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('commissions')
@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) { }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a commission record (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateCommissionDto, @Request() req: any) {
    return this.commissionsService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List commissions (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.commissionsService.findAll(req.user.companyId, page, limit);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'List commissions for a specific agent' })
  findByAgent(
    @Param('agentId') agentId: string,
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.commissionsService.findByAgent(agentId, req.user.companyId, page, limit);
  }

  @Get('agent/:agentId/summary')
  @ApiOperation({ summary: 'Get commission summary for an agent' })
  getSummary(@Param('agentId') agentId: string, @Request() req: any) {
    return this.commissionsService.getSummary(agentId, req.user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a commission by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.commissionsService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update commission status (COMPANY_ADMIN+)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommissionDto, @Request() req: any) {
    return this.commissionsService.update(id, req.user.companyId, dto);
  }
}
