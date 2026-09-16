import Helper from '@ember/component/helper';
import { service } from '@ember/service';

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default class FormatDateTime extends Helper {
  @service region;

  compute([date], { withSeconds, region }) {
    if (!date) return '';

    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

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

    const local = d.toLocaleString('en-US', options);
    if (!region) return local;

    const record = (this.region.regions ?? []).find((r) => r.code === region);
    const timeZone = record?.timezone;
    if (!timeZone || timeZone === browserTimeZone()) return local;

    let regional;
    try {
      regional = d.toLocaleString('en-US', { ...options, timeZone });
    } catch {
      return local;
    }
    if (regional === local) return local;

    return `${local} (${record.name || record.code}: ${regional})`;
  }
}
