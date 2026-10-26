import Component from '@glimmer/component';

const LAYOUTS = ['row', 'stack', 'block'];

// Live preview followed by its invocation snippet; not part of the shipped kit.
export default class WovenDocsExampleComponent extends Component {
  get previewClasses() {
    const parts = ['woven-example__preview'];
    const layout = LAYOUTS.includes(this.args.layout) ? this.args.layout : 'row';
    parts.push(`m-${layout}`);
    if (this.args.code) {
      parts.push('has-code');
    }
    return parts.join(' ');
  }
}
