import Controller from '@ember/controller';
import { contactName } from '../../utils/contact-display';

export default class LeasesDetailController extends Controller {
  get lease() {
    return this.model?.lease ?? null;
  }

  get tenantName() {
    return contactName(this.lease?.contact, 'Unknown tenant');
  }

  // The server refuses uploads to an archived lease.
  get canUpload() {
    return !this.lease?.deletedAt;
  }

  get documentFilters() {
    return { leaseId: this.lease?.id };
  }

  get presetLink() {
    const lease = this.lease;
    if (!lease) return null;
    return {
      type: 'lease',
      id: lease.id,
      label: `${this.tenantName} ${lease.startDate ?? ''}`.trim(),
    };
  }
}
