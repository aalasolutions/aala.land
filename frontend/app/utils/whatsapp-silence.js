// A live number with no inbound for this long may have stopped receiving webhooks.
export const INBOUND_SILENCE_DAYS = 7;

export const INBOUND_SILENCE_MS = INBOUND_SILENCE_DAYS * 24 * 60 * 60 * 1000;

export const INBOUND_SILENCE_TEXT = `No message received in ${INBOUND_SILENCE_DAYS} days. Please send a test message to confirm the connection is active.`;

const LIVE_STATUSES = new Set(['connected', 'flagged']);

function toMs(value) {
  if (!value) return 0;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

// Measured from the later of the last inbound and connectedAt, so a fresh connection is never flagged.
export function isInboundSilent(connection, now) {
  if (!connection || !LIVE_STATUSES.has(connection.status)) return false;
  const since = Math.max(
    toMs(connection.lastInboundAt),
    toMs(connection.connectedAt),
  );
  if (!since) return false;
  return now - since >= INBOUND_SILENCE_MS;
}
