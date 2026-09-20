import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';
import { Logger, UseFilters, ValidationPipe } from '@nestjs/common';
import { WsAckExceptionFilter } from '@shared/filters/ws-ack-exception.filter';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { errorMessage } from '@shared/utils/error.util';
import { envList } from '@shared/utils/env.util';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { WaMessage, WaUnreadState } from './wa-types';
import { MessageStoreService } from './message-store.service';
import { MarkWaChatReadDto } from './dto/mark-wa-chat-read.dto';

const corsOrigins = envList('CORS_ORIGIN', ['http://localhost:4200']);

// Param-level only: a method-level pipe would also run on the Socket argument.
const wsPayloadPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) =>
    new WsException(
      errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ') ||
        'Invalid payload',
    ),
});

@WebSocketGateway({
  namespace: 'whatsapp',
  cors: { origin: corsOrigins, credentials: true },
})
export class WhatsappGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhatsappGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companiesRepo: Repository<Company>,
    private readonly store: MessageStoreService,
  ) {}

  afterInit(nsp: Namespace) {
    // Runs before CONNECT is sent, so the room is joined first.
    nsp.use((socket, next) => {
      void this.authenticate(socket).then(next);
    });
    this.logger.log('WhatsApp WebSocket gateway ready on /whatsapp');
  }

  handleConnection(socket: Socket) {
    socket.emit('whatsapp:ready', { recovered: socket.recovered });
  }

  private async authenticate(socket: Socket): Promise<Error | undefined> {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token.trim()) {
        throw new Error('Missing socket auth token');
      }
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        exp?: number;
      }>(token);

      const user = await this.usersRepo.findOne({
        where: { id: payload.sub },
        select: { id: true, isActive: true, companyId: true },
      });
      if (!user?.isActive) throw new Error('User inactive or not found');
      if (!user.companyId)
        throw new Error('No company associated with this user');

      const company = await this.companiesRepo.findOne({
        where: { id: user.companyId },
        select: { id: true, isActive: true },
      });
      if (!company?.isActive) throw new Error('Company inactive or not found');

      socket.data = {
        userId: payload.sub,
        companyId: user.companyId,
        tokenExp: payload.exp,
      };
      await socket.join('user:' + payload.sub);
      this.logger.debug(
        `Socket ${socket.id} authenticated and joined room user:${payload.sub}`,
      );
      return undefined;
    } catch (error) {
      const message = errorMessage(error);
      this.logger.warn(
        `WhatsApp socket authentication failed for client ${socket.id}: ${message}`,
      );
      return new Error('Unauthorized');
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`WhatsApp socket disconnected: ${socket.id}`);
  }

  @SubscribeMessage('whatsapp:read')
  @UseFilters(WsAckExceptionFilter)
  async markRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody(wsPayloadPipe) dto: MarkWaChatReadDto,
  ): Promise<WaUnreadState> {
    const { userId, companyId } = (socket.data ?? {}) as {
      userId?: string;
      companyId?: string;
    };
    if (!userId || !companyId) throw new WsException('Unauthorized');

    const state = await this.store.markChatRead(
      companyId,
      userId,
      dto.chatId,
      dto.messageId,
    );
    if (!state) throw new WsException('Unknown message');
    this.emitUnread(userId, state);
    return state;
  }

  disconnectUser(userId: string) {
    this.server?.in('user:' + userId).disconnectSockets(true);
  }

  emitStatus(userId: string, data: Record<string, unknown>) {
    this.server?.to('user:' + userId).emit('whatsapp:status', data);
  }
  emitMessage(userId: string, data: WaMessage) {
    this.server?.to('user:' + userId).emit('whatsapp:message', data);
  }
  emitUnread(userId: string, data: WaUnreadState) {
    this.server?.to('user:' + userId).emit('whatsapp:unread', data);
  }
  emitAi(userId: string, data: Record<string, unknown>) {
    this.server?.to('user:' + userId).emit('whatsapp:ai', data);
  }
}
