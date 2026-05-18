// backend/src/modules/whatsapp/whatsapp.controller.ts
import {
  Controller, Get, Post, Body, Param,
  UseGuards, Res, Request,
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
import { SendWaMessageDto, SendWaMediaDto, TypingDto, AiToggleDto } from './dto/send-wa-message.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  // ── Connection ────────────────────────────────────────────────────────

  @Get('connection')
  @ApiOperation({ summary: 'WhatsApp connection status' })
  getConnection(@Request() req: AuthenticatedRequest) {
    return this.wa.getConnection(req.user.userId, req.user.companyId!);
  }

  @Get('qr')
  @ApiOperation({ summary: 'Current QR code (base64 PNG data URL or null if paired)' })
  getQR(@Request() req: AuthenticatedRequest) {
    return this.wa.getQR(req.user.userId, req.user.companyId!);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Clear session and generate a new QR code' })
  logout(@Request() req: AuthenticatedRequest) {
    return this.wa.logout(req.user.userId, req.user.companyId!);
  }

  // ── Chats / Messages ──────────────────────────────────────────────────

  @Get('chats')
  @ApiOperation({ summary: 'Chat list with last-message preview' })
  getChats(@Request() req: AuthenticatedRequest) {
    return { chats: this.wa.getChats(req.user.userId) };
  }

  @Get('messages')
  @ApiOperation({ summary: 'All stored messages' })
  getAllMessages(@Request() req: AuthenticatedRequest) {
    return { messages: this.wa.getAllMessages(req.user.userId) };
  }

  @Get('messages/:chatId')
  @ApiOperation({ summary: 'Messages for a specific chat' })
  getMessages(@Request() req: AuthenticatedRequest, @Param('chatId') chatId: string) {
    return { messages: this.wa.getMessagesForChat(req.user.userId, decodeURIComponent(chatId)) };
  }

  // ── Sending ───────────────────────────────────────────────────────────

  @Post('send')
  @ApiOperation({ summary: 'Send a text message' })
  send(@Request() req: AuthenticatedRequest, @Body() dto: SendWaMessageDto) {
    return this.wa.send(req.user.userId, req.user.companyId!, dto.chatId, dto.message, dto.replyTo);
  }

  @Post('send-media')
  @ApiOperation({ summary: 'Send a media message' })
  sendMedia(@Request() req: AuthenticatedRequest, @Body() dto: SendWaMediaDto) {
    return this.wa.sendMedia(req.user.userId, req.user.companyId!, dto.chatId, dto.filePath, {
      mediaType: dto.mediaType, caption: dto.caption, fileName: dto.fileName,
    });
  }

  @Post('typing')
  @ApiOperation({ summary: 'Send typing indicator' })
  typing(@Request() req: AuthenticatedRequest, @Body() dto: TypingDto) {
    return this.wa.typing(req.user.userId, req.user.companyId!, dto.chatId);
  }

  // ── AI ────────────────────────────────────────────────────────────────

  @Get('ai')
  @ApiOperation({ summary: 'AI config and enabled state' })
  getAi(@Request() req: AuthenticatedRequest) { return this.wa.getAiConfig(req.user.userId); }

  @Post('ai/toggle')
  @ApiOperation({ summary: 'Toggle or set AI auto-reply' })
  toggleAi(@Request() req: AuthenticatedRequest, @Body() dto: AiToggleDto) {
    return this.wa.toggleAi(req.user.userId, req.user.companyId!, dto.enabled);
  }

  @Get('ai/history/:chatId')
  @ApiOperation({ summary: 'AI conversation history for a chat' })
  getAiHistory(@Param('chatId') chatId: string) {
    return { chatId, history: this.wa.getAiHistory(decodeURIComponent(chatId)) };
  }

  @Post('ai/clear')
  @ApiOperation({ summary: 'Clear AI history for one or all chats' })
  clearAi(@Body() body: { chatId?: string }) {
    return this.wa.clearAiHistory(body.chatId);
  }

  // ── Media serving ─────────────────────────────────────────────────────

  @Get('media/:type/:filename')
  @ApiOperation({ summary: 'Serve downloaded media file' })
  async serveMedia(
    @Request() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const dirs = await this.wa.getMediaDirs(req.user.userId, req.user.companyId!);
    const dirMap: Record<string, string> = {
      images: dirs.IMAGE_DIR,
      videos: dirs.VIDEO_DIR,
      audio: dirs.AUDIO_DIR,
      documents: dirs.DOCUMENT_DIR,
    };
    const dir = dirMap[type];
    if (!dir) return res.status(400).json({ error: 'Invalid media type' });

    const root = resolve(dir);
    const filePath = resolve(join(root, filename));
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

    return res.sendFile(filePath);
  }
}
