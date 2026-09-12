/**
 * Formats a caught value into a log-safe string. Non-Error values are stringified as-is.
 */
export function errorMessage(err: unknown, withStack = false): string {
  if (err instanceof Error) {
    return withStack ? (err.stack ?? err.message) : err.message;
  }
  return String(err);
}
