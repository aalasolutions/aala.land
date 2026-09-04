// backend/src/modules/whatsapp/whatsapp.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AiToggleDto } from './dto/ai-toggle.dto';
import { ListWaMessagesDto } from './dto/list-wa-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto';
import { WhatsappSignupService } from './whatsapp-signup.service';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly wa: WhatsappService,
    private readonly signup: WhatsappSignupService,
  ) {}

  // ── Connection ────────────────────────────────────────────────────────

  @Get('connection')
  @ApiOperation({
    summary: "The caller's own connected number, or null when none exists",
  })
  getConnection(@Request() req: AuthenticatedRequest) {
    return this.wa.getConnection(req.user.userId, req.user.companyId!);
  }

  @Get('signup-config')
  @ApiOperation({
    summary: 'App id and Embedded Signup configuration id for the browser flow',
  })
  getSignupConfig() {
    return this.signup.getSignupConfig();
  }

  @Post('connect')
  @ApiOperation({
    summary: 'Exchange an Embedded Signup code and store the connection',
  })
  connect(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConnectWhatsappDto,
  ) {
    return this.signup.connect(req.user.userId, req.user.companyId!, dto);
  }

  @Delete('connection')
  @ApiOperation({
    summary: "Release the caller's number and destroy its stored token",
  })
  disconnect(@Request() req: AuthenticatedRequest) {
    return this.signup.disconnect(req.user.userId, req.user.companyId!);
  }

  // ── Chats / Messages ──────────────────────────────────────────────────

  @Get('chats')
  @ApiOperation({ summary: 'Chat list with last-message preview' })
  async getChats(@Request() req: AuthenticatedRequest) {
    return {
      chats: await this.wa.getChats(req.user.companyId!, req.user.userId),
    };
  }

  @Get('messages')
  @ApiOperation({
    summary: 'Stored messages across all chats, newest page first',
  })
  async getAllMessages(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListWaMessagesDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 500;
    const { messages, hasMore } = await this.wa.getAllMessages(
      req.user.companyId!,
      req.user.userId,
      page,
      limit,
    );
    return { messages, hasMore, page, limit };
  }

  @Get('messages/:chatId')
  @ApiOperation({ summary: 'Messages for a specific chat' })
  async getMessages(
    @Request() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    return {
      messages: await this.wa.getMessagesForChat(
        req.user.companyId!,
        req.user.userId,
        chatId,
      ),
    };
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a text message as the human operator' })
  async send(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SendMessageDto,
  ) {
    return this.wa.sendMessage(
      req.user.userId,
      req.user.companyId!,
      dto.chatId,
      dto.body,
    );
  }

  // ── AI ────────────────────────────────────────────────────────────────

  @Get('ai')
  @ApiOperation({ summary: 'AI config and enabled state' })
  getAi(@Request() req: AuthenticatedRequest) {
    return this.wa.getAiConfig(req.user.companyId!);
  }

  @Get('ai/credits')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'AI credit usage for the current period, broken down by agent',
  })
  getAiCredits(@Request() req: AuthenticatedRequest) {
    return this.wa.getAiCreditUsage(req.user.companyId!);
  }

  @Post('ai/toggle')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Toggle or set AI auto-reply' })
  async toggleAi(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AiToggleDto,
  ) {
    return this.wa.toggleAi(req.user.userId, req.user.companyId!, dto.enabled);
  }

  @Get('ai/history/:chatId')
  @ApiOperation({ summary: 'AI conversation history for a chat' })
  async getAiHistory(
    @Request() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    const history = await this.wa.getAiHistory(req.user.userId, chatId);
    return { chatId, history };
  }
}
