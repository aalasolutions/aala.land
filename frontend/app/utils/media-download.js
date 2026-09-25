// A cached signed URL with time left downloads through the anchor itself; otherwise a blank tab
// opens inside the click gesture and is pointed at the fresh URL, so popup blockers never drop it.
export function openSignedDownload({
  whatsapp,
  uuid,
  currentUrl,
  event,
  onUrl,
  onError,
}) {
  const cached = whatsapp.peekMediaUrl(uuid);
  if (cached && cached === currentUrl) return null;
  event.preventDefault();
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  return whatsapp
    .getMediaUrl(uuid)
    .then((url) => {
      onUrl?.(url);
      if (tab && !tab.closed) tab.location = url;
      else window.open(url, '_blank', 'noopener');
    })
    .catch((err) => {
      if (tab && !tab.closed) tab.close();
      onError?.(err);
    });
}
