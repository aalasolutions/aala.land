export async function safeJson(auth, path, logPrefix = 'ROUTE') {
  try {
    return await auth.fetchJson(path);
  } catch (e) {
    console.error(`[${logPrefix}] Failed to fetch ${path}:`, e.message);
    return null;
  }
}
