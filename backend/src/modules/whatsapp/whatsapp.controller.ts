import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AiToggleDto } from './dto/ai-toggle.dto';
import { ListWaMessagesDto } from './dto/list-wa-messages.dto';
import { ListWaChatMessagesDto } from './dto/list-wa-chat-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { WaChatIdParamDto } from './dto/wa-chat-id-param.dto';
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto';
import { WhatsappSignupService } from './whatsapp-signup.service';
import {
  WaSignedMediaUrl,
  WhatsappMediaService,
} from './whatsapp-media.service';
import { DeleteWaMediaDto } from './dto/delete-wa-media.dto';
import { SendWaMediaDto } from './dto/send-wa-media.dto';
import { WhatsappMediaSendService } from './whatsapp-media-send.service';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';
import {
  AiHistoryMessage,
  WaConnectionInfo,
  WaMessage,
  WaMessageWindow,
  WaSignupConfig,
} from './wa-types';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly wa: WhatsappService,
    private readonly signup: WhatsappSignupService,
    private readonly media: WhatsappMediaService,
    private readonly mediaSend: WhatsappMediaSendService,
  ) {}

  @Get('connection')
  @ApiOperation({
    summary: "The caller's own connected number, or null when none exists",
  })
  getConnection(@Request() req: AuthenticatedRequest) {
    return this.wa.getConnection(req.user.userId, requireCompanyId(req.user));
  }

  @Get('signup-config')
  @ApiOperation({
    summary: 'App id and Embedded Signup configuration id for the browser flow',
  })
  getSignupConfig(): WaSignupConfig {
    return this.signup.getSignupConfig();
  }

  @Post('connect')
  @ApiOperation({
    summary: 'Exchange an Embedded Signup code and store the connection',
  })
  connect(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConnectWhatsappDto,
  ): Promise<WaConnectionInfo> {
    return this.signup.connect(
      req.user.userId,
      requireCompanyId(req.user),
      dto,
    );
  }

  @Delete('connection')
  @ApiOperation({
    summary: "Release the caller's number and destroy its stored token",
  })
  disconnect(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    return this.signup.disconnect(req.user.userId, requireCompanyId(req.user));
  }

  @Get('chats')
  @ApiOperation({ summary: 'Chat list with last-message preview' })
  async getChats(@Request() req: AuthenticatedRequest) {
    return {
      chats: await this.wa.getChats(
        requireCompanyId(req.user),
        req.user.userId,
      ),
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
    const limit = query.limit ?? 50;
    const { messages, hasMore } = await this.wa.getAllMessages(
      requireCompanyId(req.user),
      req.user.userId,
      page,
      limit,
    );
    return { messages, hasMore, page, limit };
  }

  @Get('messages/:chatId')
  @ApiOperation({
    summary:
      'Latest messages for a chat, or the page older than `before`, newer than `after`, or centred on `around`',
  })
  getMessages(
    @Request() req: AuthenticatedRequest,
    @Param() { chatId }: WaChatIdParamDto,
    @Query() query: ListWaChatMessagesDto,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean } | WaMessageWindow> {
    const companyId = requireCompanyId(req.user);
    const limit = query.limit ?? 50;
    const { before, after, around } = query;
    if ([before, after, around].filter((c) => c !== undefined).length > 1) {
      throw new BadRequestException('Use only one of before, after or around');
    }
    if (after !== undefined) {
      return this.wa.getMessagesAfter(
        companyId,
        req.user.userId,
        chatId,
        after,
        limit,
      );
    }
    if (around !== undefined) {
      return this.wa.getMessagesAround(
        companyId,
        req.user.userId,
        chatId,
        around,
        limit,
      );
    }
    return this.wa.getMessagesForChat(
      companyId,
      req.user.userId,
      chatId,
      limit,
      before,
    );
  }

  @Get('messages/:uuid/media')
  @ApiOperation({
    summary:
      'Short-lived signed URL for stored message media (owning agent or company admin)',
  })
  getMedia(
    @Request() req: AuthenticatedRequest,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ): Promise<WaSignedMediaUrl> {
    return this.media.signUrl(
      requireCompanyId(req.user),
      { userId: req.user.userId, role: req.user.role },
      uuid,
    );
  }

  @Post('messages/:uuid/delete-media')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete the stored media of a message with a reason; the message stays (owning agent or company admin)',
  })
  deleteMedia(
    @Request() req: AuthenticatedRequest,
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Body() dto: DeleteWaMediaDto,
  ): Promise<void> {
    const companyId = requireCompanyId(req.user);
    return this.media.deleteStoredMedia(companyId, uuid, req.user.userId, {
      companyId,
      userId: req.user.userId,
      role: req.user.role,
      reason: dto.reason,
    });
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a text message as the human operator' })
  async send(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SendMessageDto,
  ): Promise<WaMessage> {
    return this.wa.sendMessage(
      req.user.userId,
      requireCompanyId(req.user),
      dto.chatId,
      dto.body,
    );
  }

  @Post('chats/:chatId/media')
  @ApiOperation({
    summary:
      'Send one file as the human operator; stored in our bucket first, then sent through WhatsApp',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file. Multipart field name must be "file".',
        },
        caption: { type: 'string', maxLength: 1024 },
        voice: { type: 'boolean' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // Spooled to disk, not RAM; the service removes the temp file on every path.
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, _file, cb) => cb(null, `wa-upload-${randomUUID()}`),
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  sendMedia(
    @Request() req: AuthenticatedRequest,
    @Param() { chatId }: WaChatIdParamDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: SendWaMediaDto,
  ): Promise<WaMessage> {
    if (!file) {
      throw new BadRequestException(
        'No file provided. Send it in a multipart/form-data field named "file".',
      );
    }
    return this.mediaSend.sendFile(
      requireCompanyId(req.user),
      req.user.userId,
      chatId,
      file,
      { caption: dto.caption, voice: dto.voice },
    );
  }

  @Post('messages/:uuid/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resend a media message WhatsApp refused, from our stored copy (owning agent or company admin)',
  })
  retryMedia(
    @Request() req: AuthenticatedRequest,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ): Promise<WaMessage> {
    return this.mediaSend.retry(
      requireCompanyId(req.user),
      { userId: req.user.userId, role: req.user.role },
      uuid,
    );
  }

  @Get('ai')
  @ApiOperation({ summary: 'AI config and enabled state' })
  getAi(@Request() req: AuthenticatedRequest) {
    return this.wa.getAiConfig(requireCompanyId(req.user));
  }

  @Get('ai/credits')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'AI credit usage for the current period, broken down by agent',
  })
  getAiCredits(@Request() req: AuthenticatedRequest) {
    return this.wa.getAiCreditUsage(requireCompanyId(req.user));
  }

  @Post('ai/toggle')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Toggle or set AI auto-reply' })
  async toggleAi(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AiToggleDto,
  ) {
    return this.wa.toggleAi(
      req.user.userId,
      requireCompanyId(req.user),
      dto.enabled,
    );
  }

  @Get('ai/history/:chatId')
  @ApiOperation({ summary: 'AI conversation history for a chat' })
  async getAiHistory(
    @Request() req: AuthenticatedRequest,
    @Param() { chatId }: WaChatIdParamDto,
  ): Promise<{ chatId: string; history: AiHistoryMessage[] }> {
    const history = await this.wa.getAiHistory(req.user.userId, chatId);
    return { chatId, history };
  }
}
