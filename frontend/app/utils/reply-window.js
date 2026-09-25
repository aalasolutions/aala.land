// Meta's 24h reply window opens only on an inbound message; an agent reply never extends it.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Coarse on purpose: the operator needs "plenty of time" or "almost gone", not seconds.
export function formatRemaining(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'under a minute';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 1) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
