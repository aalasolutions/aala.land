import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { errorMessage } from '@shared/utils/error.util';

// Answers a failed socket.io request through its ack as { error }; without an ack, Nest's default.
@Catch()
export class WsAckExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsAckExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Handler args are (client, data, ack?).
    const arg: unknown = host.getArgByIndex(2);
    if (typeof arg !== 'function') {
      super.catch(exception, host);
      return;
    }
    const ack = arg as (response: { error: string }) => void;
    if (exception instanceof WsException) {
      const error = exception.getError();
      ack({ error: typeof error === 'string' ? error : 'Bad request' });
      return;
    }
    this.logger.error(errorMessage(exception, true));
    ack({ error: 'Internal server error' });
  }
}
