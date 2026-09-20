import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type Request } from 'express';

export const WHATSAPP_WEBHOOK_BODY_LIMIT = '4mb';

// Meta batches webhooks past Express's 100kb default; only that route gets the larger limit.
export function configureBodyParsers(
  app: NestExpressApplication,
  globalPrefix = '',
): void {
  const webhookPath = `${globalPrefix ? `/${globalPrefix}` : ''}/whatsapp/webhook`;
  const webhookJson = json({
    limit: WHATSAPP_WEBHOOK_BODY_LIMIT,
    // Same bytes Nest's rawBody option keeps; the webhook HMAC is computed over them.
    verify: (req, _res, buf) => {
      (req as unknown as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  });

  // Registered first; the global parser below then skips the already consumed body.
  app.getHttpAdapter().getInstance().post(webhookPath, webhookJson);
  app.useBodyParser('json');
}
