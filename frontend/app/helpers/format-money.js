import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { formatMoney } from '../utils/money';
import { localeForRegion } from '../utils/locale';

// Named args: currency (row's own, else region's), minor (integer minor units), compact (default true).
export default class FormatMoney extends Helper {
  @service region;

  compute([value], { currency, compact = true, minor = false } = {}) {
    return formatMoney(value, localeForRegion(this.region.activeRegion), {
      currency: currency ?? this.region.currencyCode,
      compact,
      minor,
    });
  }
}
