import Component from '@glimmer/component';
import { mediaTypeIcon } from 'land/utils/wa-media-label';

const FRAME_KINDS = new Set(['image', 'sticker', 'video']);

export default class WhatsappPendingMediaComponent extends Component {
  get item() {
    return this.args.item;
  }

  get isFailed() {
    return this.item.state === 'failed';
  }

  get icon() {
    return mediaTypeIcon(this.item.kind);
  }

  get showsFrame() {
    return FRAME_KINDS.has(this.item.kind) && Boolean(this.item.previewUrl);
  }

  // The fragment makes Safari paint the first frame of a paused preview.
  get videoSrc() {
    return `${this.item.previewUrl}#t=0.1`;
  }
}
