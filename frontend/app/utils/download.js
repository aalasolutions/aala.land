// Reads the file name the server set, RFC 6266 style, in either spelling.
export function filenameFromDisposition(header) {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

// Saves a fetch response through a blob link; the endpoint already checked access.
export async function saveResponseAsFile(response, fallbackName) {
  const blob = await response.blob();
  const name =
    filenameFromDisposition(response.headers.get('Content-Disposition')) ||
    fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
