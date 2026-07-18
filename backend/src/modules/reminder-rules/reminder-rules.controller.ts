import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReminderRulesService } from './reminder-rules.service';
import { CreateReminderRuleDto } from './dto/create-reminder-rule.dto';
import { UpdateReminderRuleDto } from './dto/update-reminder-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('reminder-rules')
@Controller('reminder-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReminderRulesController {
  constructor(private readonly reminderRulesService: ReminderRulesService) {}

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a reminder rule (ADMIN+)' })
  create(
    @Body() dto: CreateReminderRuleDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reminderRulesService.create(requireCompanyId(req.user), dto);
  }

  @Get()
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'List reminder rules for current company (paginated)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.reminderRulesService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
    );
  }

  @Get(':id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get a reminder rule by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reminderRulesService.findOne(id, requireCompanyId(req.user));
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a reminder rule (ADMIN+)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderRuleDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reminderRulesService.update(
      id,
      requireCompanyId(req.user),
      dto,
    );
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a reminder rule (sets isActive=false)',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reminderRulesService.remove(id, requireCompanyId(req.user));
  }
}
