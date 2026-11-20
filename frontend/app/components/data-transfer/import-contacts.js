import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { canImport, tierSentence } from 'land/utils/feature-gate';
import { saveResponseAsFile } from 'land/utils/download';

const ENTITY = 'contacts';
export const IMPORT_ACCEPT = '.csv,.xlsx';
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const VALUE_COLUMNS = [
  { name: 'First Name', valuePath: 'firstName', width: 140 },
  { name: 'Last Name', valuePath: 'lastName', width: 140 },
  { name: 'Phone', valuePath: 'phone', width: 150 },
  { name: 'Email', valuePath: 'email', width: 200 },
  { name: 'Region', valuePath: 'regionCode', width: 110 },
];

export default class DataTransferImportContactsComponent extends Component {
  @service dataTransfer;
  @service region;
  @service session;
  @service notifications;

  @tracked step = 'upload';
  @tracked file = null;
  @tracked regionCode = '';
  @tracked plan = null;
  @tracked result = null;
  @tracked busy = false;

  accept = IMPORT_ACCEPT;
  maxBytes = IMPORT_MAX_BYTES;
  lockedTitle = tierSentence('import');
  // Bumped by reset so a response from a cleared wizard is dropped.
  requestSeq = 0;

  columns = [
    { name: 'Row', valuePath: 'row', width: 70 },
    { name: 'Status', valuePath: 'status', width: 110 },
    { name: 'Column', valuePath: 'column', width: 130 },
    { name: 'Reason', valuePath: 'reason', width: 280 },
    ...VALUE_COLUMNS,
  ];

  get locked() {
    return !canImport(this.session);
  }

  get regions() {
    return this.region.regions ?? [];
  }

  get needsRegionPick() {
    return this.regions.length > 1;
  }

  get regionOptions() {
    return this.regions.map((region) => ({
      value: region.code,
      label: region.name,
    }));
  }

  get canCheck() {
    return Boolean(this.file) && !this.busy;
  }

  get fileErrors() {
    return this.plan?.fileErrors ?? [];
  }

  get problemRows() {
    return (this.plan?.rows ?? [])
      .filter((row) => row.status !== 'add')
      .map((row) => ({
        id: String(row.row),
        row: row.row,
        status: row.status,
        column: row.column ?? '',
        reason: row.reason ?? '',
        ...(row.values ?? {}),
      }));
  }

  get canConfirm() {
    return (this.plan?.willAdd ?? 0) > 0 && !this.busy;
  }

  get failedRows() {
    return this.result?.failedRows ?? [];
  }

  getRowClass = (row) => (row?.status === 'skip' ? 'is-muted' : '');

  @action setFile(file) {
    this.file = file;
  }

  @action setRegion(value) {
    this.regionCode = value ?? '';
  }

  @action async check() {
    if (!this.canCheck) return;
    const plan = await this.sendUpload((file, regionCode) =>
      this.dataTransfer.preview(ENTITY, file, regionCode),
    );
    if (plan) {
      this.plan = plan;
      this.step = 'confirm';
    }
  }

  @action async confirm() {
    if (!this.canConfirm) return;
    const result = await this.sendUpload((file, regionCode) =>
      this.dataTransfer.commit(ENTITY, file, regionCode),
    );
    if (result) {
      this.result = result;
      this.step = 'result';
    }
  }

  // Runs one upload call; returns null when it failed or the wizard was reset meanwhile.
  async sendUpload(send) {
    const seq = ++this.requestSeq;
    this.busy = true;
    try {
      const response = await send(this.file, this.regionCode || undefined);
      return seq === this.requestSeq ? response : null;
    } catch (error) {
      if (seq === this.requestSeq) this.notifications.error(error.message);
      return null;
    } finally {
      if (seq === this.requestSeq) this.busy = false;
    }
  }

  @action async downloadTemplate(format) {
    try {
      const response = await this.dataTransfer.template(ENTITY, format);
      await saveResponseAsFile(response, `contacts-template.${format}`);
    } catch (error) {
      this.notifications.error(error.message);
    }
  }

  @action async downloadFailed(format) {
    try {
      const rows = this.failedRows.map((row) => ({
        values: row.values,
        reason: row.reason,
      }));
      const response = await this.dataTransfer.failedFile(ENTITY, rows, format);
      await saveResponseAsFile(response, `contacts-not-imported.${format}`);
    } catch (error) {
      this.notifications.error(error.message);
    }
  }

  @action reset() {
    this.requestSeq += 1;
    this.step = 'upload';
    this.file = null;
    this.plan = null;
    this.result = null;
    this.busy = false;
  }
}
