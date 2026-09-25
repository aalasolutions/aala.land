import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { mediaTypeIcon } from 'land/utils/wa-media-label';
import { CAPTION_MAX_LENGTH, canCaption } from 'land/utils/wa-outbound-media';

const THUMBNAIL_KINDS = new Set(['image', 'sticker']);

export default class WhatsappAttachmentTrayComponent extends Component {
  captionMaxLength = CAPTION_MAX_LENGTH;

  // One object URL per rendered row, released when the row goes away.
  preview = modifier((image, [file]) => {
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  });

  get items() {
    return this.args.items ?? [];
  }

  get isUploading() {
    return this.items.some((item) => item.state === 'uploading');
  }

  get sendableCount() {
    return this.items.filter((item) => !item.refused && item.state !== 'sent')
      .length;
  }

  get sendLabel() {
    const count = this.sendableCount;
    return `Send ${count} ${count === 1 ? 'file' : 'files'}`;
  }

  get sendDisabled() {
    return Boolean(this.args.disabled) || this.sendableCount === 0;
  }

  showCaption = (item) => !item.refused && canCaption(item);

  hasThumbnail = (item) => THUMBNAIL_KINDS.has(item.kind);

  iconFor = (item) => (item.kind ? mediaTypeIcon(item.kind) : 'file-x');
}
