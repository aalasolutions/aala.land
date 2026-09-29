import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

// Request access for a LIMITED contact, or show that a request is already waiting.
export default class ContactAccessActionComponent extends Component {
  @service auth;
  @service notifications;

  @tracked requested = false;
  @tracked isRequesting = false;

  get isPending() {
    return Boolean(
      this.args.contact?.accessPending || this.args.pending || this.requested,
    );
  }

  @action
  async request() {
    if (this.isRequesting || !this.args.contact?.id) return;
    this.isRequesting = true;
    try {
      const json = await this.auth.fetchJson('/contact-access-requests', {
        method: 'POST',
        body: JSON.stringify({ contactId: this.args.contact.id }),
      });
      this.requested = true;
      this.notifications.success(
        'Access requested: an approver has been asked',
      );
      this.args.onRequested?.(this.args.contact, json?.data ?? null);
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isRequesting = false;
    }
  }
}
