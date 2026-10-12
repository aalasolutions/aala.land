import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { contactName } from '../../utils/contact-display';
import { canEditRecord, canViewRecordHistory } from '../../utils/roles';

export default class LeasesDetailController extends Controller {
  @service auth;
  @service router;

  @tracked showDrawer = false;
  @tracked drawerMode = 'edit';
  @tracked drawerLease = null;
  @tracked showTerminate = false;

  resetState() {
    this.showDrawer = false;
    this.drawerLease = null;
    this.showTerminate = false;
  }

  get lease() {
    return this.model?.lease ?? null;
  }

  get tenantName() {
    return contactName(this.lease?.contact, 'Unknown tenant');
  }

  get subtitle() {
    const unit = this.model?.unit?.label;
    return unit ? `Lease agreement for ${unit}` : 'Lease agreement';
  }

  // An archived lease is read-only: no uploads, no document edits.
  get canUpload() {
    return !this.lease?.deletedAt;
  }

  get canManage() {
    return (
      Boolean(this.lease) &&
      !this.lease.deletedAt &&
      canEditRecord(this.auth.currentUser?.role)
    );
  }

  // Mirrors the service status rules.
  get canRenew() {
    return this.canManage && ['ACTIVE', 'EXPIRED'].includes(this.lease.status);
  }

  get canTerminate() {
    return this.canManage && this.lease.status === 'ACTIVE';
  }

  get canViewHistory() {
    return canViewRecordHistory(this.auth.currentUser?.role);
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

  // Kept through the post-renew transition.
  @action openDrawer(mode) {
    this.drawerMode = mode;
    this.drawerLease = this.lease;
    this.showDrawer = true;
  }

  @action closeDrawer() {
    this.showDrawer = false;
  }

  @action afterSave(result) {
    const renewed = result?.newLease?.id;
    if (renewed) {
      this.router.transitionTo('leases.detail', renewed);
    } else {
      this.router.refresh('leases.detail');
    }
  }

  @action openTerminate() {
    this.showTerminate = true;
  }

  @action closeTerminate() {
    this.showTerminate = false;
  }

  @action refresh() {
    this.router.refresh('leases.detail');
  }
}
