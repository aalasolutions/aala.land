import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { dueStatus } from 'land/utils/due-status';
import { todayInZone } from 'land/utils/local-date';

export default class DueWord extends Helper {
  @service region;

  compute([dueDate], { format } = {}) {
    const today = todayInZone(this.region.activeRegion?.timezone);
    const status = dueStatus(dueDate, today);
    return format === 'relative' ? status.label : status.word;
  }
}
