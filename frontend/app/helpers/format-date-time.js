import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import {
  browserTimeZone,
  formatDualZoneDateTime,
  formatShortDateTime,
} from '../utils/local-date';

export default class FormatDateTime extends Helper {
  @service region;

  compute([date], { withSeconds, region }) {
    const options = {
      locale: 'en-US',
      todayZone: this.region.activeRegion?.timezone,
      withSeconds,
    };

    const local = formatShortDateTime(date, options);
    if (!local) return '';
    if (!region) return local;

    const record = (this.region.regions ?? []).find((r) => r.code === region);
    const timeZone = record?.timezone;
    if (!timeZone || timeZone === browserTimeZone()) return local;

    return formatDualZoneDateTime(
      date,
      record.name || record.code,
      timeZone,
      options,
    );
  }
}
