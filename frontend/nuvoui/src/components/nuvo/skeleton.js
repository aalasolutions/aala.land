import Component from '@glimmer/component';

const SHAPES = ['text', 'title', 'circle', 'rect'];
const WIDTHS = ['25', '50', '75', 'full'];

export default class NuSkeletonComponent extends Component {
  get classes() {
    const parts = ['nu-skeleton'];

    if (SHAPES.includes(this.args.shape)) {
      parts.push(`m-${this.args.shape}`);
    }
    if (WIDTHS.includes(String(this.args.width))) {
      parts.push(`m-w-${this.args.width}`);
    }

    return parts.join(' ');
  }

  get lineClasses() {
    return 'nu-skeleton m-text';
  }

  get hasMultipleLines() {
    return Number(this.args.lines) > 1;
  }

  get lineItems() {
    const count = Number(this.args.lines) || 0;
    return Array.from({ length: count }, (_, index) => index);
  }
}
