import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { browserTimeZone, formatInstant } from '../utils/local-date';

export default class FormatDateTime extends Helper {
  @service region;

  compute([date], { withSeconds, region }) {
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };

    if (withSeconds) {
      options.second = '2-digit';
    }

    const local = formatInstant(date, 'en-US', options);
    if (!local) return '';
    if (!region) return local;

    const record = (this.region.regions ?? []).find((r) => r.code === region);
    const timeZone = record?.timezone;
    if (!timeZone || timeZone === browserTimeZone()) return local;

    const regional = formatInstant(date, 'en-US', options, timeZone);
    if (!regional || regional === local) return local;

    return `${local} (${record.name || record.code}: ${regional})`;
  }
}
