import Component from '@glimmer/component';
import { service } from '@ember/service';
import { regionNameFor } from '../utils/region-name';

export default class RegionNoticeComponent extends Component {
  @service region;

  get show() {
    const own = this.args.regionCode;
    const selected = this.region.regionCode;
    return Boolean(own && selected && own !== selected);
  }

  get message() {
    return `This ${this.args.noun} is in ${this.nameOf(this.args.regionCode)}. You are viewing from ${this.nameOf(this.region.regionCode)}.`;
  }

  nameOf(code) {
    return regionNameFor(this.region.regions, code);
  }
}
