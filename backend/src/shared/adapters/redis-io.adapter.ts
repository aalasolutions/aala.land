import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, ServerOptions } from 'socket.io';
import { RedisService } from '@modules/redis/redis.service';

// Without this every gateway emit reaches only the sockets held by the emitting
// replica. Applied app-wide, so both the WhatsApp and notifications gateways use it.
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  connect(): void {
    this.adapterConstructor = createAdapter(
      this.redis.duplicate('socket-pub'),
      this.redis.duplicate('socket-sub'),
    );
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
