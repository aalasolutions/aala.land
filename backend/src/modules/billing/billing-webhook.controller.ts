import {
  Controller,
  HttpCode,
  Inject,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingWebhookService } from './billing-webhook.service';
import {
  BILLING_PROVIDER,
  BillingProvider,
} from './provider/billing-provider.interface';

@ApiTags('Billing')
@Controller('billing')
export class BillingWebhookController {
  constructor(
    private readonly webhookService: BillingWebhookService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  @Post('webhook')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Billing provider webhook receiver. Public endpoint; ' +
      'authenticated by raw-body signature verification, not JWT.',
  })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    // The active adapter names its signature header; a repeated header is rejected as missing.
    const header = req.headers?.[this.provider.signatureHeader];
    const signature = typeof header === 'string' ? header : undefined;
    return this.webhookService.handleWebhook(req.rawBody, signature);
  }
}
