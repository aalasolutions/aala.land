import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import {
  LEAD_STATUS_OPTIONS,
  TEMPERATURE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  NONE_OPTION,
} from 'land/constants';
import ContactSelection, {
  CONTACT_REQUIRED_ERROR,
} from 'land/utils/contact-selection';

function localityIdOf(lead) {
  return lead?.locality?.id ?? lead?.localityId ?? '';
}

function formFrom(lead, regionCode) {
  if (!lead) {
    return {
      status: 'NEW',
      temperature: 'WARM',
      source: 'OTHER',
      regionCode,
      localityId: '',
      unitId: '',
    };
  }
  return {
    status: lead.status ?? 'NEW',
    temperature: lead.temperature ?? 'WARM',
    source: lead.source ?? 'OTHER',
    regionCode: lead.regionCode ?? regionCode,
    localityId: localityIdOf(lead),
    unitId: lead.unitId ?? '',
  };
}

// No @lead means create.
export default class LeadsLeadDrawerComponent extends Component {
  @service auth;
  @service notifications;
  @service region;

  @tracked draft = null;
  @tracked localities = [];
  @tracked filteredUnits = [];
  @tracked isSaving = false;
  @tracked error = null;

  @tracked selectionEpoch = 0;

  draftFor = null;
  statusOptions = LEAD_STATUS_OPTIONS;
  temperatureOptions = TEMPERATURE_OPTIONS;
  sourceOptions = LEAD_SOURCE_OPTIONS;

  get isEdit() {
    return Boolean(this.args.lead);
  }

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.lead?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.lead, this.region.regionCode);
  }

  // Rebuilt per record and on close.
  @cached
  get contactSelection() {
    this.selectionEpoch;
    this.source;
    return new ContactSelection();
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  set errorMsg(message) {
    this.error = message ? { source: this.source, message } : null;
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create Lead';
  }

  get showRegionField() {
    return this.region.regions.length > 1;
  }

  get regionOptions() {
    return this.region.regionOptions;
  }

  get localityOptions() {
    return [
      NONE_OPTION,
      ...(this.localities || []).map((locality) => ({
        value: locality.id,
        label: locality.name,
      })),
    ];
  }

  get unitOptions() {
    return [
      NONE_OPTION,
      ...(this.filteredUnits || []).map((unit) => ({
        value: unit.id,
        label: `Property ${unit.unitNumber} (${unit.status})`,
      })),
    ];
  }

  // The form mounts each time the drawer opens, for the record it opened with.
  loadOnOpen = modifier(() => {
    this.loadOptions();
  });

  async loadOptions() {
    // Leave the render pass; reads after this are not tracked by the modifier.
    await Promise.resolve();
    if (this.isDestroying || this.isDestroyed) return;
    const { regionCode, localityId } = this.form;
    this.loadLocalities(regionCode);
    if (localityId) this.loadUnits(localityId, regionCode);
  }

  async loadLocalities(regionCode) {
    let localities;
    try {
      const params = new URLSearchParams();
      if (regionCode) {
        params.set('regionCode', regionCode);
      }

      const queryString = params.toString();
      const url = queryString
        ? `/locations/company/localities?${queryString}`
        : '/locations/company/localities';
      const json = await this.auth.fetchJson(url);
      localities = json.data || [];
    } catch (e) {
      console.error('Failed to load localities:', e);
      localities = [];
    }
    if (this.isDestroying || this.isDestroyed) return;
    this.localities = localities;
  }

  async loadUnits(localityId, regionCode) {
    let units;
    try {
      const params = new URLSearchParams({
        localityId,
        limit: '100',
      });

      if (regionCode) {
        params.set('regionCode', regionCode);
      }

      const json = await this.auth.fetchJson(
        `/properties/units?${params.toString()}`,
      );
      units = json.data?.data || [];
    } catch (e) {
      console.error('Failed to load units:', e);
      units = [];
    }
    if (this.isDestroying || this.isDestroyed) return;
    this.filteredUnits = units;
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
  }

  @action setRegionCode(value) {
    this.draftFor = this.source;
    this.draft = {
      ...this.form,
      regionCode: value,
      localityId: '',
      unitId: '',
    };
    this.filteredUnits = [];
    this.loadLocalities(value);
  }

  @action setLocalityId(value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, localityId: value, unitId: '' };
    this.filteredUnits = [];
    if (value) {
      this.loadUnits(value, this.form.regionCode);
    }
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.filteredUnits = [];
    this.selectionEpoch += 1;
    this.error = null;
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    const lead = this.args.lead;
    const isEdit = this.isEdit;
    const selection = this.contactSelection;
    if (!isEdit && !selection.isPresent) {
      this.errorMsg = CONTACT_REQUIRED_ERROR;
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';

    const form = this.form;
    const source = this.source;
    const path = isEdit ? `/leads/${lead.id}` : '/leads';

    try {
      const originalLocalityId = localityIdOf(lead);
      const originalUnitId = lead?.unitId ?? '';
      const originalRegionCode = lead?.regionCode ?? '';

      const json = await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          // Edit must omit identity fields (name/phone/email) or forbidNonWhitelisted 400s.
          ...(isEdit
            ? {}
            : selection.contactId
              ? {
                  contactId: selection.contactId,
                  ...selection.verifyPhoneField('contactVerifyPhone'),
                }
              : selection.cleanIdentity),
          status: form.status,
          temperature: form.temperature,
          source: form.source,
          ...(isEdit
            ? {
                ...(form.localityId !== originalLocalityId
                  ? { localityId: form.localityId || null }
                  : {}),
                ...(form.unitId !== originalUnitId
                  ? { unitId: form.unitId || null }
                  : {}),
                ...(form.regionCode !== originalRegionCode
                  ? { regionCode: form.regionCode }
                  : {}),
              }
            : {
                ...(form.localityId ? { localityId: form.localityId } : {}),
                ...(form.unitId ? { unitId: form.unitId } : {}),
                ...(form.regionCode ? { regionCode: form.regionCode } : {}),
              }),
        }),
      });

      this.notifications.success(isEdit ? 'Lead updated' : 'Lead created');
      if (!isEdit && json?.data?.contactAccess === 'PENDING') {
        this.notifications.info('Access pending: an approver has been asked');
      }
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      const message = selection.takeConflict(e)
        ? 'Contact already added'
        : e.message;
      this.error = { source, message };
    } finally {
      this.isSaving = false;
    }
  }
}
