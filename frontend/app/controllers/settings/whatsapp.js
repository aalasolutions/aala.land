import Controller from '@ember/controller';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class SettingsWhatsappController extends Controller {
  @service whatsapp;

  @tracked aiPrompt = '';
  @tracked isSaving = false;
  @tracked successMsg = '';
  @tracked errorMsg = '';

  @action
  setPrompt(event) {
    this.aiPrompt = event.target.value;
    this.successMsg = '';
    this.errorMsg = '';
  }

  @action
  async save(event) {
    if (event) event.preventDefault();
    this.isSaving = true;
    this.successMsg = '';
    this.errorMsg = '';

    try {
      const promptToSave = this.aiPrompt.trim() || null;
      await this.whatsapp.updateSettings(promptToSave);
      this.successMsg = 'Settings saved.';
    } catch {
      this.errorMsg = 'Failed to save. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }

  @action
  async restoreDefault() {
    this.aiPrompt = '';
    this.isSaving = true;
    this.successMsg = '';
    this.errorMsg = '';

    try {
      await this.whatsapp.updateSettings(null);
      this.successMsg = 'Restored to default prompt.';
    } catch {
      this.errorMsg = 'Failed to restore. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
}
