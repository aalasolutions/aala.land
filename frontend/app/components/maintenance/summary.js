import Component from '@glimmer/component';
import { service } from '@ember/service';
import { daysUntil, formatInstant, todayInZone } from 'land/utils/local-date';
import { plural } from 'land/utils/plural';

const STAGES = [
  { key: 'OPEN', label: 'Reported' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'PENDING_APPROVAL', label: 'Approval' },
  { key: 'COMPLETED', label: 'Done' },
];

export default class MaintenanceSummaryComponent extends Component {
  @service region;

  get today() {
    return todayInZone(this.region.activeRegion?.timezone);
  }

  // The vendor read can fail while the id is still set, so say it is assigned rather than none.
  get vendorName() {
    if (this.args.vendor?.name) return this.args.vendor.name;
    return this.args.workOrder?.vendorId ? 'Vendor assigned' : '-';
  }

  get assigneeName() {
    if (this.args.assignee?.name) return this.args.assignee.name;
    return this.args.workOrder?.assignedTo ? 'Assigned' : '-';
  }

  get isCancelled() {
    return this.args.workOrder?.status === 'CANCELLED';
  }

  get stages() {
    const at = STAGES.findIndex((s) => s.key === this.args.workOrder?.status);
    return STAGES.map((stage, i) => ({
      ...stage,
      state: at < 0 || i > at ? 'todo' : i === at ? 'current' : 'done',
    }));
  }

  get hasPeople() {
    const wo = this.args.workOrder;
    return Boolean(wo?.vendorId || wo?.assignedTo);
  }

  get daysOpen() {
    const wo = this.args.workOrder;
    if (!wo?.createdAt || wo.completedAt || this.isCancelled) return null;
    const zone = this.region.activeRegion?.timezone;
    const since = daysUntil(todayInZone(zone, wo.createdAt), this.today);
    return since === null ? null : Math.max(0, -since);
  }

  get scheduledIn() {
    const wo = this.args.workOrder;
    if (!wo?.scheduledDate || wo.completedAt) return null;
    return daysUntil(wo.scheduledDate, this.today);
  }

  get nextStep() {
    const wo = this.args.workOrder;
    if (!wo) return '';
    if (this.isCancelled) return 'This work order was cancelled.';
    if (wo.status === 'COMPLETED') return 'The work is done and closed.';
    if (wo.status === 'PENDING_APPROVAL')
      return 'Work is done and waiting for owner or manager approval to close.';
    if (!this.hasPeople)
      return 'Nobody is on this yet. Assign a vendor or a team member.';
    if (!wo.scheduledDate)
      return 'Someone is on it, but no visit is scheduled yet.';
    const days = this.scheduledIn;
    if (days === 0) return 'The visit is scheduled for today.';
    if (days > 0) return `The visit is scheduled in ${plural(days, 'day')}.`;
    return 'The scheduled visit date has passed. Check in with whoever is on it.';
  }

  get reportedLine() {
    const wo = this.args.workOrder;
    if (!wo) return '';
    const parts = [];
    if (wo.reportedBy) parts.push(`Reported by ${wo.reportedBy}`);
    if (wo.createdAt) {
      parts.push(
        formatInstant(
          wo.createdAt,
          'en-US',
          { year: 'numeric', month: 'short', day: 'numeric' },
          this.region.activeRegion?.timezone,
        ),
      );
    }
    if (this.daysOpen) {
      parts.push(`open ${plural(this.daysOpen, 'day')}`);
    }
    return parts.join(' · ');
  }
}
