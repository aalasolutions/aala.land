import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { canImport } from 'land/utils/feature-gate';
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

export default class ImportContactsController extends Controller {
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

  get canImport() {
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
    this.busy = true;
    try {
      this.plan = await this.dataTransfer.preview(
        ENTITY,
        this.file,
        this.regionCode || undefined,
      );
      this.step = 'confirm';
    } catch (error) {
      this.notifications.error(error.message);
    } finally {
      this.busy = false;
    }
  }

  @action async confirm() {
    if (!this.canImport) return;
    this.busy = true;
    try {
      this.result = await this.dataTransfer.commit(
        ENTITY,
        this.file,
        this.regionCode || undefined,
      );
      this.step = 'result';
    } catch (error) {
      this.notifications.error(error.message);
    } finally {
      this.busy = false;
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
    this.step = 'upload';
    this.file = null;
    this.plan = null;
    this.result = null;
    this.busy = false;
  }
}
