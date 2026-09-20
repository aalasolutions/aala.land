import Component from '@glimmer/component';

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
const STATUSES = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];

export default class NuAvatarComponent extends Component {
  get classes() {
    const parts = ['nu-avatar'];

    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.square) {
      parts.push('m-square');
    }
    if (STATUSES.includes(this.args.status)) {
      parts.push(`m-status-${this.args.status}`);
    }

    return parts.join(' ');
  }

  get hasStatus() {
    return STATUSES.includes(this.args.status);
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
