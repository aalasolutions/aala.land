import Component from '@glimmer/component';

export default class WovenCellPersonComponent extends Component {
  get name() {
    const name = this.args.name ?? this.args.value;
    return name === null || name === undefined ? '' : String(name).trim();
  }

  // First letters of the first two words when @initials is not passed.
  get initials() {
    if (this.args.initials) return this.args.initials;
    return this.name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }
}
