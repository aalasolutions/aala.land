import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a notification for a user (ADMIN+)' })
  create(
    @Body() dto: CreateNotificationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.create(requireCompanyId(req.user), dto);
  }

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List notifications for current user (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAll(
      requireCompanyId(req.user),
      req.user.userId,
      page,
      limit,
    );
  }

  @Get('unread-count')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  getUnreadCount(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(
      requireCompanyId(req.user),
      req.user.userId,
    );
  }

  @Patch('read-all')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  markAllRead(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(
      requireCompanyId(req.user),
      req.user.userId,
    );
  }

  @Patch(':id/read')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.markAsRead(
      id,
      requireCompanyId(req.user),
      req.user.userId,
    );
  }

  @Post('send')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({
    summary:
      'Send an email or SMS notification (SUPER_ADMIN / COMPANY_ADMIN only)',
  })
  send(@Body() dto: SendNotificationDto) {
    return this.notificationsService.send(dto);
  }

  @Get('rent-reminders')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get upcoming rent-due cheques within N days' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days ahead to check (default 3)',
  })
  getRentReminders(
    @Request() req: AuthenticatedRequest,
    @Query('days', new DefaultValuePipe(3), ParseIntPipe) days: number,
  ) {
    return this.notificationsService.checkRentDueReminders(
      requireCompanyId(req.user),
      days,
    );
  }

  @Get('lease-expiry-alerts')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get leases expiring within N days' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days ahead to check (default 60)',
  })
  getLeaseExpiryAlerts(
    @Request() req: AuthenticatedRequest,
    @Query('days', new DefaultValuePipe(60), ParseIntPipe) days: number,
  ) {
    return this.notificationsService.checkLeaseExpiryAlerts(
      requireCompanyId(req.user),
      days,
    );
  }

  @Get('maintenance-reminders')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Get upcoming preventive maintenance within N days',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days ahead to check (default 7)',
  })
  getMaintenanceReminders(
    @Request() req: AuthenticatedRequest,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.notificationsService.checkMaintenanceReminders(
      requireCompanyId(req.user),
      days,
    );
  }
}
