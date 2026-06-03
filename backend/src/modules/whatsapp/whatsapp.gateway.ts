// backend/src/modules/whatsapp/whatsapp.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:4200'];

@WebSocketGateway({ namespace: 'whatsapp', cors: { origin: corsOrigins, credentials: true } })
export class WhatsappGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhatsappGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  afterInit() { this.logger.log('WhatsApp WebSocket gateway ready on /whatsapp'); }

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token.trim()) {
        throw new Error('Missing socket auth token');
      }
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      socket.data.userId = payload.sub;
      socket.join('user:' + payload.sub);
      this.logger.debug(`Socket ${socket.id} authenticated and joined room user:${payload.sub}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`WhatsApp socket authentication failed for client ${socket.id}: ${message}`);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`WhatsApp socket disconnected: ${socket.id}`);
  }

  emitStatus(userId: string, data: any) {
    this.server?.to('user:' + userId).emit('whatsapp:status', data);
  }
  emitQR(userId: string, data: any) {
    this.server?.to('user:' + userId).emit('whatsapp:qr', data);
  }
  emitMessage(userId: string, data: any) {
    this.server?.to('user:' + userId).emit('whatsapp:message', data);
  }
  emitAi(userId: string, data: any) {
    this.server?.to('user:' + userId).emit('whatsapp:ai', data);
  }
}
