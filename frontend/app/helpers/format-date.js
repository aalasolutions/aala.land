import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { assert } from '@ember/debug';
import { formatShortDate } from '../utils/local-date';

// todayZone judges the current year to drop it; timeZone renders an instant in that zone.
export function formatDate(date, todayZone = null, timeZone = null) {
  return formatShortDate(date, { locale: 'en-US', timeZone, todayZone }) ?? '';
}

export default class FormatDate extends Helper {
  @service region;

  compute([date], { zone } = {}) {
    assert(
      `format-date: zone must be undefined or "region", got ${JSON.stringify(zone)}`,
      zone === undefined || zone === 'region',
    );
    const regionZone = this.region.activeRegion?.timezone;
    return formatDate(date, regionZone, zone === 'region' ? regionZone : null);
  }
}
