import Component from '@glimmer/component';

export default class WhatsappMessageBodyComponent extends Component {
  // A later edit back to the first text clears the original, but a live merge never drops a field.
  get originalText() {
    const { originalBody, body } = this.args.message ?? {};
    return originalBody && originalBody !== body ? originalBody : null;
  }
}
