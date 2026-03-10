import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class CommissionsController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked filterStatus = '';

  get filteredCommissions() {
    const all = this.model?.commissions || [];
    if (!this.filterStatus) return all;
    return all.filter((c) => c.status === this.filterStatus);
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  @action async approveCommission(commission) {
    try {
      await this.auth.fetchJson(`/commissions/${commission.id}/approve`, {
        method: 'POST',
      });
      this.notifications.success('Commission approved');
      this.router.refresh('commissions');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to approve');
    }
  }

  @action async payCommission(commission) {
    try {
      await this.auth.fetchJson(`/commissions/${commission.id}/pay`, {
        method: 'POST',
      });
      this.notifications.success('Commission marked as paid');
      this.router.refresh('commissions');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to mark as paid');
    }
  }
}
