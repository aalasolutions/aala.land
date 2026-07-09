import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { BillingService } from './billing.service';
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
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

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
