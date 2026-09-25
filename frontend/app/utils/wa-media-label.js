const TYPE_LABELS = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
};

export function mediaTypeLabel(type) {
  return TYPE_LABELS[type] ?? 'Attachment';
}

export function mediaLabel(msg) {
  return msg?.mediaFileName || mediaTypeLabel(msg?.mediaType);
}
