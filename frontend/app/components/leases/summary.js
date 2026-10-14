import Component from '@glimmer/component';
import { service } from '@ember/service';
import { LEASE_TYPE_OPTIONS, optionLabelFor } from 'land/constants';
import { contactName } from 'land/utils/contact-display';
import { daysUntil, toEpochMs, todayInZone } from 'land/utils/local-date';
import { plural } from 'land/utils/plural';

const DAY_MS = 86400000;
const DAYS_PER_MONTH = 30.4375;
const WARN_DAYS = 60;
const DANGER_DAYS = 30;

export default class LeasesSummaryComponent extends Component {
  @service region;

  get tenantName() {
    return contactName(this.args.lease?.contact, 'Unknown tenant');
  }

  get tenantId() {
    const lease = this.args.lease;
    return lease?.contact?.id ?? lease?.contactId ?? null;
  }

  get typeLabel() {
    const type = this.args.lease?.type;
    return type ? optionLabelFor(LEASE_TYPE_OPTIONS, type) : '-';
  }

  get start() {
    return toEpochMs(this.args.lease?.startDate);
  }

  get end() {
    return toEpochMs(this.args.lease?.endDate);
  }

  get hasTerm() {
    return Number.isFinite(this.start) && Number.isFinite(this.end);
  }

  get isActive() {
    return this.args.lease?.status === 'ACTIVE';
  }

  get daysLeft() {
    return daysUntil(
      this.args.lease?.endDate,
      todayInZone(this.region.activeRegion?.timezone),
    );
  }

  get percent() {
    if (!this.hasTerm || this.end <= this.start) return 0;
    const elapsed = (Date.now() - this.start) / (this.end - this.start);
    return Math.round(Math.min(1, Math.max(0, elapsed)) * 100);
  }

  get urgency() {
    const left = this.daysLeft;
    if (!this.isActive || left === null || left > WARN_DAYS) return 'primary';
    return left > DANGER_DAYS ? 'warning' : 'danger';
  }

  // Inclusive of the end date.
  get termDays() {
    if (!this.hasTerm || this.end < this.start) return null;
    return Math.round((this.end - this.start) / DAY_MS) + 1;
  }

  get termMonths() {
    const months = this.termDays && Math.round(this.termDays / DAYS_PER_MONTH);
    return months >= 1 ? months : null;
  }

  get length() {
    if (this.termDays === null) return null;
    return this.termMonths
      ? plural(this.termMonths, 'month')
      : plural(this.termDays, 'day');
  }

  get countdown() {
    const left = this.daysLeft;
    if (!this.isActive || left === null) return null;
    if (left < 0) return `Ended ${plural(-left, 'day')} ago`;
    if (left === 0) return 'Ends today';
    return `${plural(left, 'day')} left`;
  }

  get nextStep() {
    const lease = this.args.lease;
    if (!lease) return '';
    if (lease.deletedAt) return 'This lease is archived and read-only.';
    const left = this.daysLeft;
    switch (lease.status) {
      case 'DRAFT':
        return 'This lease is a draft. Activate it once the tenant signs.';
      case 'EXPIRED':
        return 'This lease has expired. Renew it, or archive it once the tenant leaves.';
      case 'TERMINATED':
        return 'This lease was terminated early.';
      case 'RENEWED':
        return 'This lease was renewed into a new one.';
      case 'ACTIVE':
        if (left === null) return 'This lease is running.';
        if (left < 0) {
          return `The end date passed ${plural(-left, 'day')} ago. Renew it or mark it expired.`;
        }
        if (left === 0) return 'This lease ends today.';
        if (left <= WARN_DAYS) {
          return `Ends in ${plural(left, 'day')}. Time to talk about renewal.`;
        }
        return 'Running smoothly. Nothing needs your attention.';
      default:
        return '';
    }
  }

  get termRent() {
    const rent = Number(this.args.lease?.monthlyRent);
    if (!rent || !this.termMonths) return null;
    return rent * this.termMonths;
  }

  get chequeAmount() {
    const cheques = Number(this.args.lease?.numberOfCheques);
    if (!this.termRent || !cheques) return null;
    return this.termRent / cheques;
  }
}
