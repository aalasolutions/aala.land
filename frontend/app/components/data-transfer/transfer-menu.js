import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { canExport, canImport, isTransferAdmin } from 'land/utils/feature-gate';
import { saveResponseAsFile } from 'land/utils/download';

export default class DataTransferTransferMenuComponent extends Component {
  @service router;
  @service session;
  @service dataTransfer;
  @service notifications;

  @tracked promptOpen = false;

  get entity() {
    return this.args.entity;
  }

  get visible() {
    return isTransferAdmin(this.session);
  }

  // Import and the sample file need an import page; a page without one exports only.
  get hasImport() {
    return Boolean(this.args.importRoute);
  }

  get importLocked() {
    return !canImport(this.session);
  }

  get exportLocked() {
    return !canExport(this.session);
  }

  @action import() {
    if (this.importLocked) {
      this.promptOpen = true;
      return;
    }
    this.router.transitionTo(this.args.importRoute);
  }

  @action async sample(close) {
    close?.();
    if (this.importLocked) {
      this.promptOpen = true;
      return;
    }
    try {
      const response = await this.dataTransfer.template(this.entity, 'csv');
      await saveResponseAsFile(response, `${this.entity}-template.csv`);
    } catch (error) {
      this.notifications.error(error.message);
    }
  }

  @action exportAs(format, close) {
    close?.();
    if (this.exportLocked) {
      this.promptOpen = true;
      return;
    }
    this.args.onExport?.(format);
  }

  @action closePrompt() {
    this.promptOpen = false;
  }
}
