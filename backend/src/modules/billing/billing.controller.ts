import {
    Controller, Post, Body, Req, HttpCode, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RawBodyRequest } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    @Post('checkout')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create Stripe Checkout session for plan upgrade' })
    createCheckout(
        @Body() dto: CreateCheckoutSessionDto,
        @Request() req: AuthenticatedRequest,
    ) {
        const companyId = requireCompanyId(req.user);
        return this.billingService.createCheckoutSession(companyId, dto.tier);
    }

    @Post('cancel')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(200)
    @ApiOperation({ summary: 'Cancel active subscription immediately' })
    cancelSubscription(@Request() req: AuthenticatedRequest) {
        const companyId = requireCompanyId(req.user);
        return this.billingService.cancelSubscription(companyId);
    }

    @Post('webhook')
    @SkipThrottle()
    @HttpCode(200)
    @ApiOperation({ summary: 'Stripe webhook receiver (public, verified by signature)' })
    handleWebhook(@Req() req: RawBodyRequest<Request>) {
        const sig = (req.headers as unknown as Record<string, string>)['stripe-signature'];
        return this.billingService.handleWebhook(req.rawBody!, sig);
    }
}
