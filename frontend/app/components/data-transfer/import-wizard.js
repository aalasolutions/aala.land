import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { canImport, tierSentence } from 'land/utils/feature-gate';
import { saveResponseAsFile } from 'land/utils/download';
import { formatNumber } from 'land/helpers/format-number';

export const IMPORT_ACCEPT = '.csv,.xlsx';
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const STATUS_TAGS = {
  error: { variant: 'danger', text: 'Error' },
  skip: { variant: 'warning', text: 'Skipped' },
  add: { variant: 'info', text: 'Note' },
};

const rowCount = (count) => formatNumber([count], { unit: 'row' });

// Upload, confirm and result steps for any registered transfer entity; the entity-specific copy and columns arrive as args.
export default class DataTransferImportWizardComponent extends Component {
  @service dataTransfer;
  @service region;
  @service router;
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

  get entity() {
    return this.args.entity;
  }

  get confirmTitle() {
    const { willAdd, willSkip, failed } = this.plan;
    const errors = failed === 1 ? 'has an error' : 'have errors';
    return `Will add ${rowCount(willAdd)}, skip ${rowCount(willSkip)}, and ${rowCount(failed)} ${errors}`;
  }

  get resultTitle() {
    const { added, skipped, failed } = this.result;
    return `Added ${rowCount(added)}, skipped ${rowCount(skipped)}, ${rowCount(failed)} not imported`;
  }

  get plural() {
    return this.args.nouns?.plural ?? this.entity;
  }

  get singular() {
    return this.args.nouns?.singular ?? this.plural;
  }

  // Uploaded cells sit under `cells`, so a sheet column named like a row field (such as Status) cannot shadow it.
  get columns() {
    return [
      { name: 'Row', valuePath: 'row', width: 70 },
      { name: 'Status', valuePath: 'status', width: 110 },
      { name: 'Column', valuePath: 'column', width: 130 },
      { name: 'Reason', valuePath: 'reason', width: 280 },
      ...(this.args.valueColumns ?? []).map((column) => ({
        ...column,
        valuePath: `cells.${column.valuePath}`,
      })),
    ];
  }

  get locked() {
    return !canImport(this.session);
  }

  get regions() {
    return this.region.regions ?? [];
  }

  get needsRegionPick() {
    return Boolean(this.args.showRegionPicker) && this.regions.length > 1;
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

  // Skipped and failed rows, plus added rows that carry a note such as an owner that was not found.
  get problemRows() {
    return (this.plan?.rows ?? [])
      .filter((row) => row.status !== 'add' || row.reason)
      .map((row) => ({
        id: String(row.row),
        row: row.row,
        status: row.status,
        column: row.column ?? '',
        reason: row.reason ?? '',
        cells: row.values ?? {},
      }));
  }

  get canConfirm() {
    return (this.plan?.willAdd ?? 0) > 0 && !this.busy;
  }

  // Error rows only: skipped rows are not failures and noted rows import.
  get plannedFailedRows() {
    return (this.plan?.rows ?? []).filter((row) => row.status === 'error');
  }

  get failedRows() {
    return this.step === 'confirm'
      ? this.plannedFailedRows
      : (this.result?.failedRows ?? []);
  }

  // Imported rows that carry a remark, each with the absolute URL of its detail page.
  get notes() {
    const config = this.args.notes;
    if (!config) return [];
    return (this.result?.notes ?? []).map((note) => {
      const models = [...(note.parentIds ?? []), note.id];
      return {
        id: note.id,
        row: note.row,
        reason: note.reason,
        cells: note.values ?? {},
        models,
        href: `${window.location.origin}${this.router.urlFor(config.route, ...models)}`,
      };
    });
  }

  get noteColumns() {
    return [
      { name: 'Row', valuePath: 'row', width: 70 },
      ...(this.args.notes?.columns ?? []).map((column) => ({
        ...column,
        valuePath: `cells.${column.valuePath}`,
      })),
      { name: 'Reason', valuePath: 'reason', width: 280 },
    ];
  }

  get noteLinkKey() {
    const column = (this.args.notes?.columns ?? []).find((c) => c.link);
    return column ? `cells.${column.valuePath}` : null;
  }

  statusTag = (status) => STATUS_TAGS[status] ?? STATUS_TAGS.add;

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
      this.dataTransfer.preview(this.entity, file, regionCode),
    );
    if (plan) {
      this.plan = plan;
      this.step = 'confirm';
    }
  }

  @action async confirm() {
    if (!this.canConfirm) return;
    const result = await this.sendUpload((file, regionCode) =>
      this.dataTransfer.commit(this.entity, file, regionCode),
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
      const response = await this.dataTransfer.template(this.entity, format);
      await saveResponseAsFile(response, `${this.entity}-template.${format}`);
    } catch (error) {
      this.notifications.error(error.message);
    }
  }

  @action async downloadFailed(format) {
    try {
      const rows = this.failedRows.map((row) => ({
        values: row.values,
        reason: row.reason,
        column: row.column,
      }));
      const response = await this.dataTransfer.failedFile(
        this.entity,
        rows,
        format,
      );
      await saveResponseAsFile(
        response,
        `${this.entity}-not-imported.${format}`,
      );
    } catch (error) {
      this.notifications.error(error.message);
    }
  }

  @action async downloadNotes(format) {
    try {
      const keys = (this.args.notes?.columns ?? []).map((c) => c.valuePath);
      const rows = this.notes.map((note) => ({
        values: {
          ...Object.fromEntries(keys.map((key) => [key, note.cells[key]])),
          link: note.href,
        },
        reason: note.reason,
      }));
      const response = await this.dataTransfer.notesFile(
        this.entity,
        rows,
        format,
      );
      await saveResponseAsFile(
        response,
        `${this.args.notes.fileStem}.${format}`,
      );
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
