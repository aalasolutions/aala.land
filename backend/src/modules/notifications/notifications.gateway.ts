import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

const websocketCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['http://localhost:4200'];

@WebSocketGateway({
  cors: {
    origin: websocketCorsOrigins,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.getSocketToken(client);
      const payload = await this.jwtService.verifyAsync<{ sub: string; companyId: string }>(token);
      const user = await this.usersRepository.findOne({
        where: { id: payload.sub, companyId: payload.companyId, isActive: true },
        select: {
          id: true,
          companyId: true,
          isActive: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User no longer exists or is inactive');
      }

      client.join(`user_${user.id}`);
      client.join(`company_${user.companyId}`);
      this.logger.log(`Client connected: ${client.id}, joined user_${user.id} and company_${user.companyId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Socket authentication failed for client ${client.id}: ${message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user_${userId}`).emit('newNotification', notification);
  }

  broadcastToCompany(companyId: string, event: string, data: any) {
    this.server.to(`company_${companyId}`).emit(event, data);
  }

  private getSocketToken(client: Socket): string {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || !token.trim()) {
      throw new UnauthorizedException('Missing socket auth token');
    }

    return token;
  }
}
