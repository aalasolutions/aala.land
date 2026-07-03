export default async function parseErrorResponse(response, fallbackMessage) {
  const err = await response.json().catch(() => ({}));
  return Array.isArray(err.message)
    ? err.message.join(', ')
    : (err.message ?? fallbackMessage);
}
