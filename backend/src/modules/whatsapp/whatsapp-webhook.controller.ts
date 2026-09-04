import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WebhookVerifyDto } from './dto/webhook-payload.dto';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly webhookService: WhatsappWebhookService) {}

  @Get('webhook')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Meta webhook verification handshake. Public endpoint; echoes hub.challenge ' +
      'when the verify token matches, not JWT-authenticated.',
  })
  // @Res bypasses the global ResponseInterceptor: Meta byte-compares the raw hub.challenge body
  verify(@Query() query: WebhookVerifyDto, @Res() res: Response): void {
    let challenge: string;
    try {
      challenge = this.webhookService.verifyWebhook(query);
    } catch {
      res.status(403).type('text/plain').send('Forbidden');
      return;
    }
    res.status(200).type('text/plain').send(challenge);
  }

  @Post('webhook')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'WhatsApp Cloud API webhook receiver. Public endpoint; authenticated by ' +
      'X-Hub-Signature-256 raw-body HMAC, not JWT.',
  })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ received: true }> {
    return this.webhookService.handleWebhook(req.rawBody, signature);
  }
}
