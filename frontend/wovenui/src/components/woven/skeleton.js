import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

// title folds into text and rect into the default block; the kit has text and circle only.
const SHAPES = { text: 'text', title: 'text', circle: 'circle' };
const WIDTHS = { 25: '25%', 50: '50%', 75: '75%', full: '100%' };

export default class WovenSkeletonComponent extends Component {
  get classes() {
    const shape = SHAPES[this.args.shape];
    return shape ? `wu-skeleton ${shape} animated` : 'wu-skeleton animated';
  }

  get style() {
    const width = WIDTHS[String(this.args.width)];
    return width ? htmlSafe(`--wu-skeleton--Width: ${width}`) : undefined;
  }

  get hasMultipleLines() {
    return Number(this.args.lines) > 1;
  }

  get lineItems() {
    const count = Number(this.args.lines) || 0;
    return Array.from({ length: count }, (_, index) => index);
  }
}
