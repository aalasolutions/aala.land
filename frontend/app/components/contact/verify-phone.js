import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { guidFor } from '@ember/object/internals';

export const NO_MATCH_MESSAGE = 'The number does not match';

// Unlocks a LIMITED contact when the caller types its stored number; a miss reveals nothing.
export default class ContactVerifyPhoneComponent extends Component {
  @service auth;

  @tracked phone = '';
  @tracked error = '';
  @tracked isChecking = false;

  inputId = `${guidFor(this)}-verify-phone`;

  @action
  setPhone(value) {
    this.phone = value ?? '';
    this.error = '';
  }

  @action
  async submit(event) {
    event.preventDefault();
    const phone = this.phone.trim();
    if (!phone || this.isChecking) return;
    this.isChecking = true;
    this.error = '';
    try {
      const json = await this.auth.fetchJson(
        `/contacts/${this.args.contactId}/verify-phone`,
        { method: 'POST', body: JSON.stringify({ phone }) },
      );
      if (json?.data?.verified) {
        this.phone = '';
        this.args.onVerified?.(json.data.contact ?? null);
      } else {
        this.error = NO_MATCH_MESSAGE;
      }
    } catch (e) {
      this.error = e.message;
    } finally {
      this.isChecking = false;
    }
  }
}
