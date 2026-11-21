import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type Request } from 'express';

export const WHATSAPP_WEBHOOK_BODY_LIMIT = '4mb';
// Failed rows return as JSON with repeated keys and a reason per row, so this exceeds the upload cap.
export const DATA_TRANSFER_BODY_LIMIT = '10mb';

// Meta batches webhooks past Express's 100kb default; only that route gets the larger limit.
export function configureBodyParsers(
  app: NestExpressApplication,
  globalPrefix = '',
): void {
  const prefix = globalPrefix ? `/${globalPrefix}` : '';
  const webhookPath = `${prefix}/whatsapp/webhook`;
  const webhookJson = json({
    limit: WHATSAPP_WEBHOOK_BODY_LIMIT,
    // Same bytes Nest's rawBody option keeps; the webhook HMAC is computed over them.
    verify: (req, _res, buf) => {
      (req as unknown as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  });

  // Registered first; the global parser below then skips the already consumed body.
  const instance = app.getHttpAdapter().getInstance();
  instance.post(webhookPath, webhookJson);
  // Failed import rows travel back as JSON to become a file; the default body limit is too small.
  instance.post(
    `${prefix}/data-transfer/:entity/failed-file`,
    json({ limit: DATA_TRANSFER_BODY_LIMIT }),
  );
  instance.post(
    `${prefix}/data-transfer/:entity/notes-file`,
    json({ limit: DATA_TRANSFER_BODY_LIMIT }),
  );
  app.useBodyParser('json');
}
