import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReminderRulesService } from './reminder-rules.service';
import { CreateReminderRuleDto } from './dto/create-reminder-rule.dto';
import { UpdateReminderRuleDto } from './dto/update-reminder-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('reminder-rules')
@Controller('reminder-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReminderRulesController {
  constructor(private readonly reminderRulesService: ReminderRulesService) {}

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a reminder rule (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateReminderRuleDto, @Request() req) {
    return this.reminderRulesService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List reminder rules for current company (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.reminderRulesService.findAll(req.user.companyId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a reminder rule by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.reminderRulesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a reminder rule (COMPANY_ADMIN+)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderRuleDto,
    @Request() req,
  ) {
    return this.reminderRulesService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a reminder rule (sets isActive=false)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.reminderRulesService.remove(id, req.user.companyId);
  }
}
