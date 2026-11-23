import { BadGatewayException, Logger } from '@nestjs/common';
import { errorMessage } from '@shared/utils/error.util';

// The signup exchange code expires in 30s, so a request still running past 15s has already lost it.
const GRAPH_TIMEOUT_MS = 15000;

export async function graphFetch<T>(
  logger: Logger,
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const raw = await res.text();
      // The URL is never logged: for the exchange it carries the code and the app secret.
      logger.error(`Graph ${label} failed ${res.status}: ${raw.slice(0, 500)}`);
      // The cause stays server side; it is never part of the HTTP response.
      throw new BadGatewayException(`WhatsApp ${label} failed`, {
        cause: `HTTP ${res.status}: ${raw.slice(0, 500)}`,
      });
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof BadGatewayException) throw err;
    const reason = errorMessage(err);
    logger.error(`Graph ${label} error: ${reason}`);
    throw new BadGatewayException(`WhatsApp ${label} error`, {
      cause: reason,
    });
  } finally {
    clearTimeout(timer);
  }
}
