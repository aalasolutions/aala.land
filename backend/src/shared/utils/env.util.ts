/** Trimmed env value, or undefined when unset or blank. */
export function envString(name: string): string | undefined;
export function envString(name: string, fallback: string): string;
export function envString(name: string, fallback?: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/** Trimmed env value; throws `Error(`${name} is not set`)` when unset or blank. */
export function envRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/** parseInt base 10; returns fallback when unset, not finite, or below min (min optional). */
export function envInt(name: string, fallback: number, min?: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (min !== undefined && parsed < min) return fallback;
  return parsed;
}

/** parseFloat; returns fallback when unset or not finite. */
export function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 'true'/'false' case-insensitive after trim; anything else (or unset) returns fallback. */
export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** Comma-separated list, each item trimmed, empty items dropped; fallback when unset or no items remain. */
export function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [...fallback];
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [...fallback];
}
