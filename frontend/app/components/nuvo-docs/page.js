import Component from '@glimmer/component';

// Documentation page frame for the /nuvo routes; not part of the shipped kit.
export default class NuvoDocsPageComponent extends Component {
  // Comma-separated invocation names rendered as code chips under the title.
  get components() {
    return String(this.args.components ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }
}
