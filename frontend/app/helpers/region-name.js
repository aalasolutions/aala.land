import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { regionNameFor } from '../utils/region-name';

export default class RegionName extends Helper {
  @service region;

  compute([code]) {
    return regionNameFor(this.region.regions, code);
  }
}
