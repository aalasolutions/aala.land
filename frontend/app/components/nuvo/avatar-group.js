import Component from '@glimmer/component';

export default class NuAvatarGroupComponent extends Component {
  get classes() {
    const parts = ['nu-avatar-group'];

    if (this.args.compact) {
      parts.push('m-compact');
    }

    return parts.join(' ');
  }
}
