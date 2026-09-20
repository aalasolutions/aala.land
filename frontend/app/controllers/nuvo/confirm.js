import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { runTask } from 'ember-lifeline';

const BUSY_DELAY = 1600;
const SERVICE_DELAY = 1200;

export default class NuvoConfirmController extends Controller {
  @service dialogs;

  @tracked confirmOpen = false;
  @tracked confirmDangerOpen = false;
  @tracked confirmBusyOpen = false;
  @tracked subtitleOpen = false;
  @tracked bodyOpen = false;
  @tracked alertOpen = false;
  @tracked isConfirmingDemo = false;
  @tracked serviceResult = 'none yet';
  @tracked deleteReason = '';

  @action
  setOpen(key, value) {
    this[key] = value;
  }

  @action
  setReason(value) {
    this.deleteReason = value;
  }

  @action
  openConfirmBusy() {
    this.confirmBusyOpen = true;
  }

  @action
  closeConfirmBusy() {
    if (this.isConfirmingDemo) {
      return;
    }
    this.confirmBusyOpen = false;
  }

  @action
  runConfirmBusy() {
    if (this.isConfirmingDemo) {
      return;
    }
    this.isConfirmingDemo = true;
    runTask(
      this,
      () => {
        this.isConfirmingDemo = false;
        this.confirmBusyOpen = false;
      },
      BUSY_DELAY,
    );
  }

  @action
  async askService() {
    const confirmed = await this.dialogs.confirm({
      title: 'Archive unit?',
      message: 'Unit 1204 will leave the active list.',
      confirmText: 'Archive',
    });
    this.serviceResult = confirmed ? 'confirmed' : 'cancelled';
  }

  @action
  async askServiceAsync() {
    const confirmed = await this.dialogs.confirm({
      title: 'Delete vendor',
      message: 'Gulf Maintenance LLC will be removed. The request takes a moment.',
      confirmText: 'Delete',
      confirmingText: 'Deleting...',
      confirmVariant: 'danger',
      onConfirm: () =>
        new Promise((resolve) => runTask(this, resolve, SERVICE_DELAY)),
    });
    this.serviceResult = confirmed ? 'deleted' : 'kept';
  }

  @action
  async alertService() {
    await this.dialogs.alert({
      title: 'Export ready',
      message: 'The CSV has been sent to your email.',
    });
    this.serviceResult = 'alert acknowledged';
  }

  code = {
    basic: `<Nuvo::Button @text="Default" @onClick={{this.open}} />

<Nuvo::ConfirmModal
  @open={{this.confirmOpen}}
  @title="Publish listing?"
  @message="Unit 1204 will become visible on all connected portals."
  @confirmText="Publish"
  @onClose={{this.close}}
  @onConfirm={{this.close}}
/>`,
    danger: `<Nuvo::ConfirmModal
  @open={{this.confirmDangerOpen}}
  @title="Delete vendor"
  @message="Delete Gulf Maintenance LLC? This cannot be undone."
  @confirmText="Delete"
  @cancelText="Keep vendor"
  @confirmVariant="danger"
  @onClose={{this.close}}
  @onConfirm={{this.close}}
/>`,
    subtitle: `<Nuvo::ConfirmModal
  @open={{this.subtitleOpen}}
  @title="Renew lease?"
  @subtitle="Unit 1204, Marina Tower"
  @message="A new 12-month term starts on 1 Jan 2027."
  @confirmText="Renew"
  @size="md"
  @onClose={{this.close}}
  @onConfirm={{this.close}}
/>`,
    body: `<Nuvo::ConfirmModal @open={{this.bodyOpen}} @title="Delete contact" @message="This cannot be undone." @confirmText="Delete" @confirmVariant="danger" @onClose={{this.close}} @onConfirm={{this.close}}>
  <Nuvo::Field @label="Reason" @required={{true}}>
    <Nuvo::Textarea @rows={{2}} @value={{this.deleteReason}} @onInput={{this.setReason}} />
  </Nuvo::Field>
</Nuvo::ConfirmModal>`,
    alert: `<Nuvo::ConfirmModal
  @open={{this.alertOpen}}
  @title="Export ready"
  @message="The CSV has been sent to your email."
  @confirmText="OK"
  @showCancel={{false}}
  @onClose={{this.close}}
  @onConfirm={{this.close}}
/>`,
    busy: `<Nuvo::ConfirmModal
  @open={{this.confirmBusyOpen}}
  @title="Re-pair WhatsApp"
  @message="Your current session will be cleared and you will need to scan a new QR code."
  @confirmText="Re-pair"
  @cancelText="Cancel"
  @confirmVariant="danger"
  @isConfirming={{this.isConfirmingDemo}}
  @confirmingText="Clearing session..."
  @onClose={{this.closeConfirmBusy}}
  @onConfirm={{this.runConfirmBusy}}
/>`,
    service: `@service dialogs;

const confirmed = await this.dialogs.confirm({
  title: 'Archive unit?',
  message: 'Unit 1204 will leave the active list.',
  confirmText: 'Archive',
});`,
    serviceAsync: `// onConfirm keeps the dialog open and busy until it resolves; throwing keeps it open for retry
const confirmed = await this.dialogs.confirm({
  title: 'Delete vendor',
  confirmText: 'Delete',
  confirmingText: 'Deleting...',
  confirmVariant: 'danger',
  onConfirm: () => this.api.delete(vendor),
});`,
    serviceAlert: `await this.dialogs.alert({ title: 'Export ready', message: 'The CSV has been sent.' });`,
  };

  argRows = [
    { name: '@open', type: 'boolean', default: 'false', description: 'Renders the dialog while true.' },
    { name: '@title', type: 'string', default: '', description: 'Dialog title.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Line under the title.' },
    { name: '@message', type: 'string', default: '', description: 'Muted body text. A default block renders after it.' },
    { name: '@size', type: '"sm" | "md" | "lg" | "xl" | "full"', default: '"sm"', description: 'Forwarded to Nuvo::Modal.' },
    { name: '@confirmText', type: 'string', default: '"Confirm"', description: 'Confirm button label.' },
    { name: '@cancelText', type: 'string', default: '"I changed my mind"', description: 'Cancel button label.' },
    { name: '@confirmingText', type: 'string', default: '', description: 'Confirm label while @isConfirming; defaults to @confirmText.' },
    { name: '@confirmVariant', type: 'string', default: '"primary"', description: 'Confirm button variant; pass "danger" for destructive actions.' },
    { name: '@showCancel', type: 'boolean', default: 'true', description: 'Set false for an alert with a single OK-style button.' },
    { name: '@showClose', type: 'boolean', default: 'true', description: 'Header close button. Hidden automatically while confirming.' },
    { name: '@isConfirming', type: 'boolean', default: 'false', description: 'Pending state: confirm shows a spinner, both buttons disable, and every dismiss path is blocked.' },
  ];

  callbackRows = [
    { name: '@onConfirm', signature: '()', description: 'Confirm pressed. Ignored while confirming.' },
    { name: '@onClose', signature: '()', description: 'Cancel, close button, backdrop or Escape. Ignored while confirming.' },
  ];

  blockRows = [
    { name: 'default', description: 'Extra body content after the message.' },
  ];

  serviceRows = [
    { name: 'dialogs.confirm', signature: '(options) => Promise<boolean>', description: 'Opens a confirm dialog through Nuvo::DialogHost; resolves true on confirm, false on dismiss. Rejects if a dialog is already open.' },
    { name: 'dialogs.alert', signature: '(options) => Promise<boolean>', description: 'confirm() with confirmText "OK" and no cancel button.' },
    { name: 'options', signature: '{ title, subtitle, message, confirmText, cancelText, confirmingText, confirmVariant, showCancel, onConfirm }', description: 'Same names as the component arguments. onConfirm may return a promise; while pending the dialog is busy, and a rejection keeps it open.' },
    { name: 'dialogs.isOpen', signature: 'boolean', description: 'True while a service dialog is showing.' },
  ];
}
