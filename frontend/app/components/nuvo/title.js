import Component from '@glimmer/component';

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'];
const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export default class NuTitleComponent extends Component {
  get classes() {
    const parts = ['nu-title'];

    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (WEIGHTS.includes(this.args.weight)) {
      parts.push(`m-${this.args.weight}`);
    }
    if (this.args.truncate) {
      parts.push('m-truncate');
    }

    return parts.join(' ');
  }

  get tag() {
    return TAGS.includes(this.args.tag) ? this.args.tag : 'h2';
  }
}
