import Component from '@glimmer/component';

// labelPosition has no CSS kit equivalent; the label always sits centered.
export default class WovenDividerComponent extends Component {
  get classes() {
    return this.args.dashed ? 'wu-divider dashed' : 'wu-divider';
  }
}
