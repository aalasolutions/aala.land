import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class CompanyController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked formName = '';
  @tracked formPhone = '';
  @tracked formAddress = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action async saveCompany(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const companyId = this.auth.currentUser?.companyId;

    try {
      await this.auth.fetchJson(`/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: this.formName,
          ...(this.formPhone ? { phone: this.formPhone } : {}),
          ...(this.formAddress ? { address: this.formAddress } : {}),
        }),
      });

      this.notifications.success('Company updated');
      this.router.refresh('company');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
