import Component from '@glimmer/component';
import { SIZE_MAP } from './-constants';

const PRESENCE = Object.freeze({
  brand: 'offline',
  secondary: 'offline',
  success: 'online',
  warning: 'away',
  danger: 'busy',
  info: 'offline',
});

export default class WovenAvatarComponent extends Component {
  get classes() {
    const parts = ['wu-avatar'];
    const size = SIZE_MAP[this.args.size];

    if (size) {
      parts.push(size);
    }
    if (this.args.square) {
      parts.push('tile');
    }

    return parts.join(' ');
  }

  get dataStatus() {
    return PRESENCE[this.args.status];
  }

  // Kit contract: the name plus the presence word, as aria-label or image alt.
  get label() {
    const name = this.hasImage
      ? this.args.alt
      : (this.args.alt ?? this.args.initials);
    const parts = [name, this.dataStatus].filter(Boolean);
    return parts.length ? parts.join(', ') : undefined;
  }

  get role() {
    return !this.hasImage && this.label ? 'img' : undefined;
  }

  get ariaLabel() {
    return this.hasImage ? undefined : this.label;
  }

  get imageAlt() {
    return this.label ?? '';
  }

  get hasImage() {
    return Boolean(this.args.src);
  }

  get hasInitials() {
    return !this.hasImage && Boolean(this.args.initials);
  }

  get hasIcon() {
    return !this.hasImage && !this.hasInitials && Boolean(this.args.icon);
  }
}
