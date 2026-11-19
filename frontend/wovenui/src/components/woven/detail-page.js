import Component from '@glimmer/component';

export default class WovenDetailPageComponent extends Component {
  // No @title and no @titleFallback is the crumb-only header.
  get title() {
    return this.args.title || this.args.titleFallback;
  }
}
