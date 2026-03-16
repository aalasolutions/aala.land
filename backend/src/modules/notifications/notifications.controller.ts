import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a notification for a user (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateNotificationDto, @Request() req) {
    return this.notificationsService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List notifications for current user (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAll(req.user.companyId, req.user.userId, page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.companyId, req.user.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.companyId, req.user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user.companyId, req.user.userId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send an email or SMS notification' })
  send(@Body() dto: SendNotificationDto) {
    return this.notificationsService.send(dto);
  }

  @Get('rent-reminders')
  @ApiOperation({ summary: 'Get upcoming rent-due cheques within N days' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days ahead to check (default 3)' })
  getRentReminders(
    @Request() req,
    @Query('days', new DefaultValuePipe(3), ParseIntPipe) days: number,
  ) {
    return this.notificationsService.checkRentDueReminders(req.user.companyId, days);
  }

  @Get('lease-expiry-alerts')
  @ApiOperation({ summary: 'Get leases expiring within N days' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days ahead to check (default 60)' })
  getLeaseExpiryAlerts(
    @Request() req,
    @Query('days', new DefaultValuePipe(60), ParseIntPipe) days: number,
  ) {
    return this.notificationsService.checkLeaseExpiryAlerts(req.user.companyId, days);
  }

  @Get('maintenance-reminders')
  @ApiOperation({ summary: 'Get upcoming preventive maintenance within N days' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days ahead to check (default 7)' })
  getMaintenanceReminders(
    @Request() req,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.notificationsService.checkMaintenanceReminders(req.user.companyId, days);
  }
}
