import Component from '@glimmer/component';

export default class NuTimelineComponent extends Component {
  get classes() {
    const parts = ['nu-timeline'];

    if (this.args.compact) {
      parts.push('m-compact');
    }
    if (this.args.alternate) {
      parts.push('m-alternate');
    }

    return parts.join(' ');
  }
}
