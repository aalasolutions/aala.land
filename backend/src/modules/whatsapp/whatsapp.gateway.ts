// backend/src/modules/whatsapp/whatsapp.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:4200'];

@WebSocketGateway({ namespace: 'whatsapp', cors: { origin: corsOrigins, credentials: true } })
export class WhatsappGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhatsappGateway.name);

  afterInit() { this.logger.log('WhatsApp WebSocket gateway ready on /whatsapp'); }

  emitStatus(data: any) { this.server?.emit('whatsapp:status', data); }
  emitQR(data: any)     { this.server?.emit('whatsapp:qr', data); }
  emitMessage(data: any){ this.server?.emit('whatsapp:message', data); }
  emitAi(data: any)     { this.server?.emit('whatsapp:ai', data); }
}
