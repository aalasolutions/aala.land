import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  LEAD_STAGES,
  TEMPERATURE_STAGES,
  LEAD_STATUS_OPTIONS,
  TEMPERATURE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  NONE_OPTION,
} from 'land/constants';

export default class LeadsController extends Controller {
  @service auth;
  @service notifications;
  @service router;
  @service region;
  @service preferences;
  @service socket;
  leadUpdatedHandler = null;

  constructor() {
    super(...arguments);
    this.setupSocket();
  }

  setupSocket() {
    this.leadUpdatedHandler = (data) => {
      // Only refresh if the update was from another user
      if (data.updatedBy !== this.auth.currentUser?.id) {
        if (this.router.isActive('leads')) {
          this.router.refresh('leads');
        }
      }
    };
    this.socket.on('leadUpdated', this.leadUpdatedHandler);
  }

  willDestroy() {
    if (this.leadUpdatedHandler) {
      this.socket.off('leadUpdated', this.leadUpdatedHandler);
    }

    super.willDestroy(...arguments);
  }

  queryParams = ['page', 'limit', 'status'];
  page = 1;
  limit = 50;
  status = '';

  @tracked showModal = false;
  @tracked showAssignModal = false;
  @tracked showDetailModal = false;
  @tracked editLead = null;
  @tracked assignLead = null;
  @tracked detailLead = null;
  @tracked leadActivities = [];
  @tracked formFirstName = '';
  @tracked formLastName = '';
  @tracked formEmail = '';
  @tracked formPhone = '';
  @tracked formStatus = 'NEW';
  @tracked formTemperature = 'WARM';
  @tracked formSource = 'OTHER';
  @tracked formLocalityId = '';
  @tracked formUnitId = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked localities = [];
  @tracked filteredUnits = [];

  @tracked _viewMode = null;

  get viewMode() {
    if (this._viewMode) return this._viewMode;
    return this.preferences.get('leads-view-mode', 'pipeline');
  }
  set viewMode(val) {
    this._viewMode = val;
  }

  viewTabs = [
    { id: 'pipeline', label: 'Pipeline', icon: 'squares-four' },
    { id: 'temperature', label: 'Temperature', icon: 'thermometer' },
    { id: 'agent', label: 'Agent', icon: 'users' },
    { id: 'list', label: 'List', icon: 'list' },
  ];

  filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'Assigned to Me' },
    { id: 'others', label: 'Others' },
    { id: 'unassigned', label: 'Unassigned' },
  ];

  @tracked filterType = 'all';
  @tracked agents = [];
  @tracked draggedLead = null;
  @tracked dropTargetStatus = null;
  @tracked dropTargetTemp = null;
  @tracked dropTargetAgent = null;
  @tracked selectedAgentId = '';
  @tracked formRegionCode = '';

  get showRegionField() {
    return this.region.regions.length > 1;
  }

  statusOptions = LEAD_STATUS_OPTIONS;

  temperatureOptions = TEMPERATURE_OPTIONS;

  sourceOptions = LEAD_SOURCE_OPTIONS;

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

  get agentOptions() {
    return [
      { value: '', label: '-- Select Agent --' },
      ...(this.agents || []).map((agent) => ({
        value: agent.id,
        label: agent.name,
      })),
    ];
  }

  get allLeads() {
    return this.model?.data ?? [];
  }

  get filteredLeads() {
    const leads = this.allLeads;
    if (this.filterType === 'mine') {
      const currentUserId = this.auth.currentUser?.id;
      return leads.filter((l) => l.assignedTo === currentUserId);
    } else if (this.filterType === 'others') {
      const currentUserId = this.auth.currentUser?.id;
      return leads.filter(
        (l) => l.assignedTo && l.assignedTo !== currentUserId,
      );
    } else if (this.filterType === 'unassigned') {
      return leads.filter((l) => !l.assignedTo);
    }
    return leads;
  }

  get columns() {
    return LEAD_STAGES.map((stage) => ({
      ...stage,
      leads: this.filteredLeads.filter((l) => l.status === stage.status),
    }));
  }

  get temperatureColumns() {
    return TEMPERATURE_STAGES.map((stage) => ({
      ...stage,
      leads: this.filteredLeads.filter(
        (l) => l.temperature === stage.temperature,
      ),
    }));
  }

  get agentColumns() {
    const leads = this.allLeads;
    const unassigned = {
      agentId: null,
      agentName: 'Unassigned',
      leads: leads.filter((l) => !l.assignedTo),
    };

    const agentCols = this.agents.map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      leads: leads.filter((l) => l.assignedTo === agent.id),
    }));

    return [unassigned, ...agentCols];
  }

  @action setFilter(filter) {
    this.filterType = filter;
  }

  @action setViewMode(mode) {
    this.viewMode = mode;
    this.preferences.set('leads-view-mode', mode);
    if (mode === 'agent' && this.agents.length === 0) {
      this.loadAgents();
    }
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Kit form components call onInput/onChange as (value, event).
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action setRegionCode(value) {
    this.formRegionCode = value;
    this.formLocalityId = '';
    this.formUnitId = '';
    this.filteredUnits = [];
    this.loadLocalities(this.formRegionCode);
  }

  @action setLocalityId(value) {
    this.formLocalityId = value;
    this.formUnitId = '';
    this.filteredUnits = [];
    if (value) {
      this.loadUnits(value, this.formRegionCode);
    }
  }

  @action openCreate() {
    this.formFirstName = '';
    this.formLastName = '';
    this.formEmail = '';
    this.formPhone = '';
    this.formStatus = 'NEW';
    this.formTemperature = 'WARM';
    this.formSource = 'OTHER';
    this.formLocalityId = '';
    this.formUnitId = '';
    this.formRegionCode = this.region.regionCode;
    this.filteredUnits = [];
    this.editLead = null;
    this.errorMsg = '';
    this.showModal = true;
    this.loadLocalities(this.formRegionCode);
  }

  @action openEdit(lead) {
    if (this.showDetailModal) {
      this.closeDetailModal();
    }

    // Identity now lives on the contact; shown for reference, not editable here.
    const contact = lead.contact ?? {};
    this.formFirstName = contact.firstName ?? '';
    this.formLastName = contact.lastName ?? '';
    this.formEmail = contact.email ?? '';
    this.formPhone = contact.phone ?? '';
    this.formStatus = lead.status ?? 'NEW';
    this.formTemperature = lead.temperature ?? 'WARM';
    this.formSource = lead.source ?? 'OTHER';
    this.formRegionCode = lead.regionCode ?? this.region.regionCode;
    const localityId = lead.locality?.id ?? lead.localityId ?? '';
    this.formLocalityId = localityId;
    this.formUnitId = lead.unitId ?? '';
    this.editLead = lead;
    this.errorMsg = '';
    this.showModal = true;
    this.loadLocalities(this.formRegionCode);
    if (localityId) {
      this.loadUnits(localityId, this.formRegionCode);
    }
  }

  @action openAssignModal(lead) {
    if (this.showDetailModal) {
      this.closeDetailModal();
    }

    this.assignLead = lead;
    this.selectedAgentId = lead.assignedTo ?? '';
    this.loadAgents();
    this.showAssignModal = true;
  }

  @action async openDetailModal(lead) {
    this.detailLead = lead;
    this.showDetailModal = true;
    await this.loadLeadActivities(lead.id);
  }

  @action closeDetailModal() {
    this.showDetailModal = false;
    this.detailLead = null;
    this.leadActivities = [];
  }

  @action async loadLeadActivities(leadId) {
    try {
      const data = await this.auth.fetchJson(`/leads/${leadId}/activities`);
      this.leadActivities = data.data || [];
    } catch (e) {
      console.error('Failed to load lead activities:', e);
      this.leadActivities = [];
    }
  }

  formatActivityDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  @action closeAssignModal() {
    this.showAssignModal = false;
    this.assignLead = null;
    this.selectedAgentId = '';
  }

  @action closeModal() {
    this.showModal = false;
    this.editLead = null;
    this.errorMsg = '';
  }

  @action stopPropagation(e) {
    e.stopPropagation();
  }

  @action async loadLocalities(
    regionCode = this.formRegionCode || this.region.regionCode,
  ) {
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
      this.localities = json.data || [];
    } catch (e) {
      console.error('Failed to load localities:', e);
      this.localities = [];
    }
  }

  @action async loadUnits(
    localityId,
    regionCode = this.formRegionCode || this.region.regionCode,
  ) {
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
      this.filteredUnits = json.data?.data || [];
    } catch (e) {
      console.error('Failed to load units:', e);
      this.filteredUnits = [];
    }
  }

  @action async loadAgents() {
    try {
      const data = await this.auth.fetchJson('/users/agents');
      this.agents = data.data || [];
    } catch (e) {
      console.error('Failed to load agents:', e);
    }
  }

  @action async handleDragStart(lead, event) {
    event.dataTransfer.setData('text/plain', lead.id);
    event.dataTransfer.effectAllowed = 'move';
    this.draggedLead = lead;
  }

  // `drop` never fires on a cancelled drag; this does.
  @action handleDragEnd() {
    this.draggedLead = null;
    this.dropTargetStatus = null;
    this.dropTargetTemp = null;
    this.dropTargetAgent = null;
  }

  @action handleDragOver(status, event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    this.dropTargetStatus = status;
  }

  @action async handleDrop(newStatus, event) {
    event.preventDefault();
    if (!this.draggedLead || this.draggedLead.status === newStatus) {
      this.draggedLead = null;
      this.dropTargetStatus = null;
      return;
    }

    try {
      await this.auth.fetchJson(`/leads/${this.draggedLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      this.notifications.success(`Lead moved to ${newStatus}`);
      this.router.refresh('leads');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.draggedLead = null;
      this.dropTargetStatus = null;
    }
  }

  @action clearDropTarget(key) {
    this[key] = null;
  }

  // Temperature Board drag-drop
  @action handleTempDragOver(temperature, event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    this.dropTargetTemp = temperature;
  }

  @action async handleTempDrop(newTemperature, event) {
    event.preventDefault();
    if (!this.draggedLead || this.draggedLead.temperature === newTemperature) {
      this.draggedLead = null;
      this.dropTargetTemp = null;
      return;
    }

    try {
      await this.auth.fetchJson(`/leads/${this.draggedLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ temperature: newTemperature }),
      });

      this.notifications.success(
        `Lead temperature changed to ${newTemperature}`,
      );
      this.router.refresh('leads');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.draggedLead = null;
      this.dropTargetTemp = null;
    }
  }

  // Agent Board drag-drop
  // Sentinel, not null: the Unassigned column's own id is null, so a null
  // drop target would mark it active whenever nothing is being dragged.
  @action handleAgentDragOver(agentId, event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    this.dropTargetAgent = agentId ?? 'unassigned';
  }

  @action async handleAgentDrop(newAgentId, event) {
    event.preventDefault();
    const currentAgent = this.draggedLead?.assignedTo || null;
    if (!this.draggedLead || currentAgent === newAgentId) {
      this.draggedLead = null;
      this.dropTargetAgent = null;
      return;
    }

    try {
      if (newAgentId) {
        await this.auth.fetchJson(`/leads/${this.draggedLead.id}/assign`, {
          method: 'POST',
          body: JSON.stringify({ agentId: newAgentId }),
        });
      } else {
        // Unassign: PATCH assignedTo to null
        await this.auth.fetchJson(`/leads/${this.draggedLead.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ assignedTo: null }),
        });
      }

      const label = newAgentId
        ? this.agents.find((a) => a.id === newAgentId)?.name || 'agent'
        : 'Unassigned';
      this.notifications.success(`Lead reassigned to ${label}`);
      this.router.refresh('leads');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.draggedLead = null;
      this.dropTargetAgent = null;
    }
  }

  @action async assignToAgent(event) {
    event.preventDefault();
    if (!this.selectedAgentId || !this.assignLead) return;

    try {
      await this.auth.fetchJson(`/leads/${this.assignLead.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agentId: this.selectedAgentId }),
      });

      this.notifications.success('Lead assigned successfully');
      this.closeAssignModal();
      this.router.refresh('leads');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }

  @action async saveLead(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editLead;
    const path = isEdit ? `/leads/${this.editLead.id}` : '/leads';

    try {
      const originalLocalityId =
        this.editLead?.locality?.id ?? this.editLead?.localityId ?? '';
      const originalUnitId = this.editLead?.unitId ?? '';
      const originalRegionCode = this.editLead?.regionCode ?? '';

      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          // Identity (name/phone/email) lives on the contact. Create resolves or
          // creates the contact from these; edit must NOT send them (UpdateLeadDto
          // no longer declares them, and forbidNonWhitelisted would 400).
          ...(isEdit
            ? {}
            : {
                firstName: this.formFirstName,
                ...(this.formLastName ? { lastName: this.formLastName } : {}),
                ...(this.formEmail ? { email: this.formEmail } : {}),
                ...(this.formPhone ? { phone: this.formPhone } : {}),
              }),
          status: this.formStatus,
          temperature: this.formTemperature,
          source: this.formSource,
          ...(isEdit
            ? {
                ...(this.formLocalityId !== originalLocalityId
                  ? { localityId: this.formLocalityId || null }
                  : {}),
                ...(this.formUnitId !== originalUnitId
                  ? { unitId: this.formUnitId || null }
                  : {}),
                ...(this.formRegionCode !== originalRegionCode
                  ? { regionCode: this.formRegionCode }
                  : {}),
              }
            : {
                ...(this.formLocalityId
                  ? { localityId: this.formLocalityId }
                  : {}),
                ...(this.formUnitId ? { unitId: this.formUnitId } : {}),
                ...(this.formRegionCode
                  ? { regionCode: this.formRegionCode }
                  : {}),
              }),
        }),
      });

      this.notifications.success(isEdit ? 'Lead updated' : 'Lead created');
      this.closeModal();
      this.router.refresh('leads');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
