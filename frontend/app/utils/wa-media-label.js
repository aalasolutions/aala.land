const TYPE_LABELS = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
};

const TYPE_ICONS = {
  image: 'image',
  video: 'video-camera',
  audio: 'microphone',
  document: 'file-text',
  sticker: 'sticker',
};

export function mediaTypeIcon(type) {
  return TYPE_ICONS[type] ?? 'paperclip';
}

export function mediaTypeLabel(type) {
  return TYPE_LABELS[type] ?? 'Attachment';
}

export function mediaLabel(msg) {
  return msg?.mediaFileName || mediaTypeLabel(msg?.mediaType);
}
