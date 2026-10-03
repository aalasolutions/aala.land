import Component from '@glimmer/component';
import { LEASE_TYPE_OPTIONS, optionLabelFor } from 'land/constants';
import { contactName } from 'land/utils/contact-display';

export default class LeasesSummaryComponent extends Component {
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
}
