export function errorMessage(err: unknown, withStack = false): string {
  if (err instanceof Error) {
    return withStack ? (err.stack ?? err.message) : err.message;
  }
  return String(err);
}
