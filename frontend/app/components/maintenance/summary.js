import Component from '@glimmer/component';

export default class MaintenanceSummaryComponent extends Component {
  // The vendor read can fail while the id is still set, so say it is assigned rather than none.
  get vendorName() {
    if (this.args.vendor?.name) return this.args.vendor.name;
    return this.args.workOrder?.vendorId ? 'Vendor assigned' : '-';
  }

  get assigneeName() {
    if (this.args.assignee?.name) return this.args.assignee.name;
    return this.args.workOrder?.assignedTo ? 'Assigned' : '-';
  }
}
