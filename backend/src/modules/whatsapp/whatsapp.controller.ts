// backend/src/modules/whatsapp/whatsapp.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { resolve, join, sep } from 'path';
import { existsSync } from 'fs';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import {
  SendWaMessageDto,
  SendWaMediaDto,
  TypingDto,
  AiToggleDto,
} from './dto/send-wa-message.dto';
import { ListWaMessagesDto } from './dto/list-wa-messages.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  private isPathInside(root: string, candidate: string): boolean {
    return candidate.startsWith(resolve(root) + sep);
  }

  // ── Connection ────────────────────────────────────────────────────────

  @Get('connection')
  @ApiOperation({ summary: 'WhatsApp connection status' })
  getConnection(@Request() req: AuthenticatedRequest) {
    return this.wa.getConnection(req.user.userId, req.user.companyId!);
  }

  @Get('qr')
  @ApiOperation({
    summary: 'Current QR code (base64 PNG data URL or null if paired)',
  })
  getQR(@Request() req: AuthenticatedRequest) {
    return this.wa.getQR(req.user.userId, req.user.companyId!);
  }

  @Post('logout')
  @ApiOperation({
    summary:
      'Clear the WhatsApp session and generate a new QR code. Stored chat history is kept.',
  })
  logout(@Request() req: AuthenticatedRequest) {
    return this.wa.logout(req.user.userId, req.user.companyId!);
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

  // ── Sending ───────────────────────────────────────────────────────────

  @Post('send')
  @ApiOperation({ summary: 'Send a text message' })
  send(@Request() req: AuthenticatedRequest, @Body() dto: SendWaMessageDto) {
    return this.wa.send(
      req.user.userId,
      req.user.companyId!,
      dto.chatId,
      dto.message,
      dto.replyTo,
    );
  }

  @Post('send-media')
  @ApiOperation({ summary: 'Send a media message' })
  sendMedia(@Request() req: AuthenticatedRequest, @Body() dto: SendWaMediaDto) {
    const dataDir =
      process.env.WHATSAPP_DATA_DIR ?? join(process.cwd(), 'data', 'whatsapp');
    const mediaBase = join(dataDir, 'media', req.user.userId);
    const resolvedPath = resolve(dto.filePath);
    if (!this.isPathInside(mediaBase, resolvedPath)) {
      throw new ForbiddenException(
        'filePath must be within your media directory',
      );
    }
    return this.wa.sendMedia(
      req.user.userId,
      req.user.companyId!,
      dto.chatId,
      resolvedPath,
      {
        mediaType: dto.mediaType,
        caption: dto.caption,
        fileName: dto.fileName,
      },
    );
  }

  @Post('typing')
  @ApiOperation({ summary: 'Send typing indicator' })
  typing(@Request() req: AuthenticatedRequest, @Body() dto: TypingDto) {
    return this.wa.typing(req.user.userId, req.user.companyId!, dto.chatId);
  }

  // ── AI ────────────────────────────────────────────────────────────────

  @Get('ai')
  @ApiOperation({ summary: 'AI config and enabled state' })
  getAi(@Request() req: AuthenticatedRequest) {
    return this.wa.getAiConfig(req.user.userId, req.user.companyId!);
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
  getAiHistory(
    @Request() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    return { chatId, history: this.wa.getAiHistory(req.user.userId, chatId) };
  }

  // ── Media serving ─────────────────────────────────────────────────────

  @Get('media/:type/:filename')
  @ApiOperation({ summary: 'Serve downloaded media file' })
  serveMedia(
    @Request() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const dirs = this.wa.getMediaDirs(req.user.userId);
    const dirMap: Record<string, string> = {
      images: dirs.IMAGE_DIR,
      videos: dirs.VIDEO_DIR,
      audio: dirs.AUDIO_DIR,
      documents: dirs.DOCUMENT_DIR,
    };
    const dir = dirMap[type];
    if (!dir) return res.status(400).json({ error: 'Invalid media type' });

    const filePath = resolve(join(dir, filename));
    if (!this.isPathInside(dir, filePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!existsSync(filePath))
      return res.status(404).json({ error: 'Not found' });

    return res.sendFile(filePath);
  }
}
