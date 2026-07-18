import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { BillingService } from './billing.service';
import { BillingHistoryService } from './billing-history.service';
import {
  AdminCheckoutDto,
  AdminChangePlanDto,
  AdminCancelDto,
} from './dto/admin-plan.dto';

/** Inline DTO used only for self-serve checkout (COMPANY_ADMIN). */
class StartCheckoutDto {
  @ApiProperty({ description: 'URL Stripe redirects to on success' })
  @IsString()
  successUrl: string;

  @ApiProperty({ description: 'URL Stripe redirects to on cancel' })
  @IsString()
  cancelUrl: string;

  @ApiProperty({
    description:
      'Payment currency the user selected; charged and pinned to the company. Defaults to USD.',
    enum: ['usd', 'aed', 'sar'],
    required: false,
    default: 'usd',
  })
  @IsOptional()
  @IsIn(['usd', 'aed', 'sar'])
  currency?: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingHistoryService: BillingHistoryService,
  ) {}

  // -------------------------------------------------------------------------
  // Unit 1 endpoint (unchanged)
  // -------------------------------------------------------------------------

  @Post('prices/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Create provider Price objects for any unsynced billing_prices rows',
  })
  syncPrices() {
    return this.billingService.syncPrices();
  }

  // -------------------------------------------------------------------------
  // COMPANY_ADMIN endpoints (self-serve — PRO only)
  // -------------------------------------------------------------------------

  @Get('subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Return current subscription state for the caller company',
  })
  async getSubscription(@Request() req: AuthenticatedRequest) {
    if (!req.user.companyId) {
      throw new BadRequestException(
        'No company context on the authenticated user',
      );
    }
    return this.billingService.getSubscriptionState(req.user.companyId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({
    summary:
      'Paginated payment history (invoices) for the caller company. ' +
      'SUPER_ADMIN may target any company via companyId, or omit it for all companies.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'companyId',
    required: false,
    type: String,
    description: 'SUPER_ADMIN only; scopes to a specific company.',
  })
  getHistory(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
  ) {
    // COMPANY_ADMIN is always scoped to its own company; only SUPER_ADMIN
    // may target another company (or all companies) via the query param. A
    // non-super-admin without a company context is rejected, never allowed to
    // fall through to an all-company list.
    if (req.user.role !== Role.SUPER_ADMIN && !req.user.companyId) {
      throw new BadRequestException('This endpoint requires a company context');
    }
    const scoped =
      req.user.role === Role.SUPER_ADMIN
        ? (companyId ?? undefined)
        : req.user.companyId!;
    return this.billingHistoryService.listBillingHistory(scoped, page, limit);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary:
      'Open a hosted Checkout session for PRO (self-serve). ' +
      'ENTERPRISE must be provisioned by a SUPER_ADMIN.',
  })
  @ApiBody({ type: StartCheckoutDto })
  startCheckout(
    @Request() req: AuthenticatedRequest,
    @Body() dto: StartCheckoutDto,
  ) {
    if (!req.user.companyId) {
      throw new BadRequestException(
        'No company context on the authenticated user',
      );
    }
    return this.billingService.startCheckout(
      req.user.companyId,
      dto.successUrl,
      dto.cancelUrl,
      dto.currency,
    );
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary:
      'Cancel the subscription at period end. ' +
      'Blocked (409) when the company has more than 1 active user.',
  })
  cancelSubscription(@Request() req: AuthenticatedRequest) {
    if (!req.user.companyId) {
      throw new BadRequestException(
        'No company context on the authenticated user',
      );
    }
    return this.billingService.cancelSubscription(req.user.companyId);
  }

  @Post('resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Undo a queued downgrade so the subscription keeps renewing.',
  })
  resumeSubscription(@Request() req: AuthenticatedRequest) {
    if (!req.user.companyId) {
      throw new BadRequestException(
        'No company context on the authenticated user',
      );
    }
    return this.billingService.resumeSubscription(req.user.companyId);
  }

  // -------------------------------------------------------------------------
  // SUPER_ADMIN endpoints (admin-initiated checkout / plan management)
  // -------------------------------------------------------------------------

  @Post('admin/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Open a hosted Checkout session for any company and plan (SUPER_ADMIN)',
  })
  adminCheckout(@Body() dto: AdminCheckoutDto) {
    return this.billingService.adminStartCheckout(
      dto.companyId,
      dto.plan,
      dto.quantity,
      dto.successUrl,
      dto.cancelUrl,
      dto.currency,
    );
  }

  @Post('admin/change-plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Switch an existing subscription between PRO and ENTERPRISE (SUPER_ADMIN)',
  })
  adminChangePlan(@Body() dto: AdminChangePlanDto) {
    return this.billingService.changePlanForCompany(dto.companyId, dto.plan);
  }

  @Post('admin/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Cancel a subscription on behalf of a company (SUPER_ADMIN)',
  })
  adminCancel(@Body() dto: AdminCancelDto) {
    return this.billingService.cancelSubscription(dto.companyId);
  }
}
