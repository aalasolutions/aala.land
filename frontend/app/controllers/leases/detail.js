import Controller from '@ember/controller';
import { service } from '@ember/service';
import { contactName } from '../../utils/contact-display';
import { ROLES } from '../../utils/roles';

// Same roles as GET /record-history.
const HISTORY_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];

export default class LeasesDetailController extends Controller {
  @service auth;

  get lease() {
    return this.model?.lease ?? null;
  }

  get tenantName() {
    return contactName(this.lease?.contact, 'Unknown tenant');
  }

  // An archived lease is read-only: no uploads, no document edits.
  get canUpload() {
    return !this.lease?.deletedAt;
  }

  get canViewHistory() {
    return HISTORY_ROLES.includes(this.auth.currentUser?.role);
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
