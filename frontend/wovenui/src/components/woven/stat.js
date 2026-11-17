import Component from '@glimmer/component';
import { SIZE_MAP } from './-constants';

// Only the change line takes a role in the kit; row and contentBleed have no kit equivalent.
const DELTA_ROLES = ['success', 'danger'];

export default class WovenStatComponent extends Component {
  get classes() {
    const size = SIZE_MAP[this.args.size];
    return size ? `wu-stat ${size}` : 'wu-stat';
  }

  get deltaClasses() {
    return DELTA_ROLES.includes(this.args.variant)
      ? `wu-stat-delta ${this.args.variant}`
      : 'wu-stat-delta';
  }

  get linkModels() {
    if (this.args.models) return this.args.models;
    return this.args.model === undefined ? [] : [this.args.model];
  }

  get linkQuery() {
    return this.args.query ?? {};
  }
}
