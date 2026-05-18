// backend/src/modules/whatsapp/whatsapp.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:4200'];

@WebSocketGateway({ namespace: 'whatsapp', cors: { origin: corsOrigins, credentials: true } })
export class WhatsappGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhatsappGateway.name);

  afterInit() { this.logger.log('WhatsApp WebSocket gateway ready on /whatsapp'); }

  handleConnection(socket: Socket) {
    socket.on('join', ({ userId }: { userId: string }) => {
      if (userId) {
        socket.join('user:' + userId);
        this.logger.debug(`Socket ${socket.id} joined room user:${userId}`);
      }
    });
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
