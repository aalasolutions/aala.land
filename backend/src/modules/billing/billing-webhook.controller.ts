import {
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingWebhookService } from './billing-webhook.service';

@ApiTags('Billing')
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly webhookService: BillingWebhookService) {}

  @Post('webhook')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Billing provider webhook receiver (Stripe). Public endpoint; ' +
      'authenticated by raw-body signature verification, not JWT.',
  })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    return this.webhookService.handleWebhook(req.rawBody, signature);
  }
}
