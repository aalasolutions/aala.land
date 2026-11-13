import Component from '@glimmer/component';

// Kit sizes by rendered font size: sm lg, default xl, lg 2xl, xl 3xl; unset renders 2xl.
const SIZES = {
  xs: 'sm',
  sm: 'sm',
  md: 'sm',
  lg: 'sm',
  xl: null,
  '2xl': 'lg',
  '3xl': 'xl',
};
const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'];
const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export default class WovenTitleComponent extends Component {
  get classes() {
    const parts = ['wu-title'];
    const size = Object.hasOwn(SIZES, this.args.size)
      ? SIZES[this.args.size]
      : 'lg';

    if (size) {
      parts.push(size);
    }
    if (WEIGHTS.includes(this.args.weight)) {
      parts.push(`font-${this.args.weight}`);
    }
    if (this.args.truncate) {
      parts.push('truncate');
    }

    return parts.join(' ');
  }

  get tag() {
    return TAGS.includes(this.args.tag) ? this.args.tag : 'h2';
  }
}
