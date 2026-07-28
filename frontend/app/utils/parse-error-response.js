export async function parseErrorPayload(response, fallbackMessage) {
  const err = await response.json().catch(() => ({}));
  const message = Array.isArray(err.message)
    ? err.message.join(', ')
    : (err.message ?? fallbackMessage);
  return { message, body: err };
}

export default async function parseErrorResponse(response, fallbackMessage) {
  const { message } = await parseErrorPayload(response, fallbackMessage);
  return message;
}
