/**
 * Safely fetches JSON from API, returning null on failure instead of throwing
 * @param {object} auth - The auth service with fetchJson method
 * @param {string} path - The API path to fetch
 * @param {string} [logPrefix='ROUTE'] - Prefix for console.error logging
 * @returns {Promise<object|null>} - JSON response or null on failure
 */
export async function safeJson(auth, path, logPrefix = 'ROUTE') {
  try {
    return await auth.fetchJson(path);
  } catch (e) {
    console.error(`[${logPrefix}] Failed to fetch ${path}:`, e.message);
    return null;
  }
}
