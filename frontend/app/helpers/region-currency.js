import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { regionCurrencyFor } from '../utils/region-name';

export default class RegionCurrency extends Helper {
  @service region;

  compute([code]) {
    return regionCurrencyFor(this.region.regions, code);
  }
}
