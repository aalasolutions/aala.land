import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as crypto from 'crypto';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) { }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a WhatsApp message' })
  async send(@Body() dto: SendMessageDto, @Request() req: any) {
    return this.whatsappService.sendMessage(req.user.companyId, dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp webhook events from Meta' })
  async webhook(
    @Body() payload: Record<string, unknown>,
    @Query('company_id') companyId: string,
    @Headers('x-hub-signature-256') signature: string,
    @Request() req: RawBodyRequest<Request>,
  ) {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret && req.rawBody) {
      const expectedSig =
        'sha256=' +
        crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
      if (signature !== expectedSig) {
        throw new ForbiddenException('Invalid webhook signature');
      }
    }
    return this.whatsappService.handleWebhook(companyId ?? 'system', payload);
  }

  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WhatsApp webhook with Meta' })
  webhookVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const configuredToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && verifyToken === configuredToken) {
      return challenge;
    }
    return { error: 'Verification failed' };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List WhatsApp messages for company' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.whatsappService.findMessages(req.user.companyId, page, limit);
  }

  @Get('lead/:leadId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List WhatsApp messages for a specific lead' })
  async findByLead(
    @Param('leadId') leadId: string,
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.whatsappService.findMessagesByLead(leadId, req.user.companyId, page, limit);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific WhatsApp message' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.whatsappService.findOne(id, req.user.companyId);
  }
}
