import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class PropertiesIndexController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked showImportModal = false;
  @tracked editArea = null;
  @tracked formName = '';
  @tracked formLocation = '';
  @tracked formDescription = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @tracked importFile = null;
  @tracked importPreview = null;
  @tracked importResults = null;
  @tracked isImporting = false;

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formName = '';
    this.formLocation = '';
    this.formDescription = '';
    this.editArea = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(area) {
    this.formName = area.name;
    this.formLocation = area.location ?? '';
    this.formDescription = area.description ?? '';
    this.editArea = area;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openImport() {
    this.importFile = null;
    this.importPreview = null;
    this.importResults = null;
    this.showImportModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editArea = null;
    this.errorMsg = '';
  }

  @action closeImportModal() {
    this.showImportModal = false;
    this.importFile = null;
    this.importPreview = null;
    this.importResults = null;
  }

  @action handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      this.importFile = file;
      this.parseCSV(file);
    } else {
      this.notifications.error('Please select a CSV file');
    }
  }

  @action async parseCSV(file) {
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((h, i) => row[h] = values[i]?.trim());
      return row;
    }).filter(r => r.areaName);

    this.importPreview = rows.slice(0, 10);
  }

  @action async importProperties() {
    if (!this.importFile || this.isImporting) return;

    this.isImporting = true;
    this.importResults = null;

    try {
      const formData = new FormData();
      formData.append('file', this.importFile);

      const res = await this.auth.authorizedFetch(`${this.auth.apiBase}/properties/bulk-import`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Import failed');
      }

      this.importResults = await res.json();
      this.notifications.success(`Import complete: ${this.importResults.created} created, ${this.importResults.failed} failed`);

      if (this.importResults.created > 0) {
        this.router.refresh('properties.index');
      }
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isImporting = false;
    }
  }

  @action downloadTemplate() {
    const csv = 'areaName,location\nDowntown Dubai,Dubai\nBusiness Bay,Dubai\nMarina,Dubai';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'properties-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  @action async saveArea(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editArea;
    const path = isEdit ? `/properties/areas/${this.editArea.id}` : '/properties/areas';

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: this.formName,
          location: this.formLocation,
          description: this.formDescription,
        }),
      });
      this.notifications.success(isEdit ? 'Area updated' : 'Area created');
      this.closeModal();
      this.router.refresh('properties.index');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
