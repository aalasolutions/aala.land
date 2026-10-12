import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class LeasesTerminateModalComponent extends Component {
  @service auth;
  @service notifications;

  @tracked reason = '';
  @tracked reasonError = '';
  @tracked isTerminating = false;

  @action setReason(value) {
    this.reason = value;
    this.reasonError = '';
  }

  @action close() {
    this.reason = '';
    this.reasonError = '';
    this.args.onClose?.();
  }

  @action async confirm() {
    const lease = this.args.lease;
    if (!lease || this.isTerminating) return;
    const reason = this.reason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }

    this.isTerminating = true;
    try {
      await this.auth.fetchJson(`/leases/${lease.id}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      this.notifications.success('Lease terminated');
      this.close();
      this.args.onTerminated?.();
    } catch (e) {
      this.notifications.error(e.message || 'Failed to terminate lease');
    } finally {
      this.isTerminating = false;
    }
  }
}
