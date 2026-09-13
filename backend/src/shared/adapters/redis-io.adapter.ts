import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { Server, ServerOptions } from 'socket.io';
import { DataSource } from 'typeorm';
import { RedisService } from '@modules/redis/redis.service';
import { User } from '@modules/users/entities/user.entity';
import { errorMessage } from '@shared/utils/error.util';

const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

interface RestorableAdapter {
  restoreSession: (pid: string, offset: string) => Promise<unknown>;
}

// Redis adapter needed so gateway emits reach sockets on every replica, not just the emitting one.
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(
    private readonly app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  connect(): void {
    this.adapterConstructor = createAdapter(
      this.redis.duplicate('socket-streams'),
    );
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS },
    }) as Server;
    const build = this.adapterConstructor;
    const guard = (adapter: RestorableAdapter) => this.guardRestore(adapter);
    // socket.io invokes this with `new`, so it cannot be an arrow function.
    server.adapter(function (nsp: unknown) {
      return guard(build(nsp));
    } as unknown as Parameters<Server['adapter']>[0]);
    return server;
  }

  // Missed packets replay before any middleware or handleConnection, so identity is re-checked here.
  private guardRestore<T extends RestorableAdapter>(adapter: T): T {
    const original = adapter.restoreSession;
    adapter.restoreSession = async (pid: string, offset: string) => {
      const session = (await Reflect.apply(original, adapter, [
        pid,
        offset,
      ])) as { data?: unknown } | null;
      const allowed = await this.isRestorable(session?.data);
      // A rejection makes the namespace build a fresh, non-recovered socket.
      if (!allowed) throw new Error('session restore refused');
      return session;
    };
    return adapter;
  }

  private async isRestorable(data: unknown): Promise<boolean> {
    const { userId, companyId, tokenExp } = (data ?? {}) as {
      userId?: unknown;
      companyId?: unknown;
      tokenExp?: unknown;
    };
    if (typeof userId !== 'string' || typeof companyId !== 'string') {
      return false;
    }
    if (typeof tokenExp !== 'number' || tokenExp * 1000 <= Date.now()) {
      return false;
    }
    try {
      const count = await this.app
        .get(DataSource)
        .getRepository(User)
        .createQueryBuilder('u')
        .innerJoin('u.company', 'c')
        .where('u.id = :userId', { userId })
        .andWhere('u.companyId = :companyId', { companyId })
        .andWhere('u.isActive = true')
        .andWhere('c.isActive = true')
        .getCount();
      return count === 1;
    } catch (error) {
      this.logger.warn(
        `Socket session restore refused, identity check failed: ${errorMessage(error)}`,
      );
      return false;
    }
  }
}
