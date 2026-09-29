import Controller from '@ember/controller';
import ContactSelection, {
  CONTACT_REQUIRED_ERROR,
} from '../utils/contact-selection';
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

const HIGH_LOAD = 8;
const MEDIUM_LOAD = 4;
const FILTER_PREF_KEY = 'leads-filter';
const DEFAULT_FILTER = 'mine';
export const DROP_AT_END = 'end';

export function insertionIndex(midpoints, pointerY) {
  return midpoints.filter((midpoint) => pointerY > midpoint).length;
}

export function moveLead(leads, leadId, status, beforeId) {
  const moving = leads.find((l) => l.id === leadId);
  if (!moving) return leads;
  const moved = moving.status === status ? moving : { ...moving, status };
  const rest = leads.filter((l) => l.id !== leadId);

  let at =
    beforeId === DROP_AT_END ? -1 : rest.findIndex((l) => l.id === beforeId);
  if (at === -1) {
    const lastInColumn = rest.findLastIndex((l) => l.status === status);
    at = lastInColumn === -1 ? rest.length : lastInColumn + 1;
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

export function columnIds(leads, status) {
  return leads.filter((l) => l.status === status).map((l) => l.id);
}

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
  contactSelection = new ContactSelection();
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

  @tracked _filterType = null;

  get filterType() {
    if (this._filterType) return this._filterType;
    const saved = this.preferences.get(FILTER_PREF_KEY, DEFAULT_FILTER);
    return this.filterTabs.some((tab) => tab.id === saved)
      ? saved
      : DEFAULT_FILTER;
  }
  set filterType(val) {
    this._filterType = val;
  }

  @tracked dropBeforeId = null;
  // Drop-time order shown until the refreshed model replaces the one it was built from.
  @tracked _optimistic = null;
  @tracked agents = [];
  @tracked draggedLead = null;
  @tracked dragOrigin = null;
  // Card hover stays off after a drop until the pointer moves, so it never sticks to the wrong card.
  @tracked suppressHover = false;
  // Set a frame after dragstart: the browser snapshots the drag image first, so it shows the full card.
  @tracked _sourceShown = false;
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

  listColumns = [
    {
      name: 'Name',
      valuePath: 'contact.displayName',
      width: 220,
      isFixed: 'left',
    },
    { name: 'Contact', valuePath: 'contact.phone', width: 220 },
    { name: 'Status', valuePath: 'status', width: 140 },
    { name: 'Temperature', valuePath: 'temperature', width: 140 },
    { name: 'Property', valuePath: 'locality.name', width: 200 },
    { name: 'Assigned', valuePath: 'assignedAgentName', width: 180 },
    { name: 'Created', valuePath: 'createdAt', width: 140, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  get allLeads() {
    if (this._optimistic && this._optimistic.source === this.model) {
      return this._optimistic.data;
    }
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

  // Workload buckets for the column bar: a business rule, so not in the template.
  loadClassFor(count) {
    if (count > HIGH_LOAD) return 'load-high';
    if (count > MEDIUM_LOAD) return 'load-medium';
    return 'load-low';
  }

  get agentColumns() {
    const leads = this.allLeads;
    const column = (agentId, agentName, ownLeads) => ({
      agentId,
      agentName,
      leads: ownLeads,
      loadClass: this.loadClassFor(ownLeads.length),
    });

    const unassigned = column(
      null,
      'Unassigned',
      leads.filter((l) => !l.assignedTo),
    );

    const agentCols = this.agents.map((agent) =>
      column(
        agent.id,
        agent.name,
        leads.filter((l) => l.assignedTo === agent.id),
      ),
    );

    return [unassigned, ...agentCols];
  }

  @action setFilter(filter) {
    this.filterType = filter;
    this.preferences.set(FILTER_PREF_KEY, filter);
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
    this.contactSelection.reset();
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

  @action closeAssignModal() {
    this.showAssignModal = false;
    this.assignLead = null;
    this.selectedAgentId = '';
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
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
    const card = event.currentTarget;
    card
      .closest('.nu-kanban')
      ?.style.setProperty('--kanban-drag-height', `${card.offsetHeight}px`);
    this.dragOrigin = {
      status: lead.status,
      anchor: card.nextElementSibling?.dataset?.leadId ?? DROP_AT_END,
    };
    this.suppressHover = true;
    this._sourceShown = false;
    this.draggedLead = lead;
    requestAnimationFrame(() => {
      if (this.draggedLead === lead) this._sourceShown = true;
    });
  }

  get dragSourceId() {
    return this._sourceShown ? (this.draggedLead?.id ?? null) : null;
  }

  // Where the make-room gap opens; null over no column or over the card's own slot.
  get dropGap() {
    const status = this.dropTargetStatus;
    const anchor = this.dropBeforeId;
    if (!this.draggedLead || !status || !anchor) return null;
    const origin = this.dragOrigin;
    if (origin?.status === status && origin.anchor === anchor) return null;
    return { status, anchor };
  }

  @action releaseHover() {
    if (this.suppressHover) this.suppressHover = false;
  }

  // `drop` never fires on a cancelled drag; this does.
  @action handleDragEnd() {
    this.draggedLead = null;
    this.dragOrigin = null;
    this.dropTargetStatus = null;
    this.dropTargetTemp = null;
    this.dropTargetAgent = null;
    this.dropBeforeId = null;
  }

  dropAnchorFor(event) {
    const draggedId = this.draggedLead?.id;
    const cards = [
      ...event.currentTarget.querySelectorAll('[data-lead-id]'),
    ].filter((card) => card.dataset.leadId !== draggedId);
    const midpoints = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const index = insertionIndex(midpoints, event.clientY);
    return cards[index]?.dataset.leadId ?? DROP_AT_END;
  }

  @action handleDragOver(status, event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (this.dropTargetStatus !== status) this.dropTargetStatus = status;
    const anchor = this.dropAnchorFor(event);
    if (this.dropBeforeId !== anchor) this.dropBeforeId = anchor;
  }

  @action async handleDrop(newStatus, event) {
    event.preventDefault();
    const lead = this.draggedLead;
    const anchor = lead ? this.dropAnchorFor(event) : null;
    this.draggedLead = null;
    this.dragOrigin = null;
    this.dropTargetStatus = null;
    this.dropBeforeId = null;
    if (!lead) return;

    const previous = this.allLeads;
    const next = moveLead(previous, lead.id, newStatus, anchor);
    const orderedIds = columnIds(next, newStatus);
    const statusChanged = lead.status !== newStatus;
    if (
      !statusChanged &&
      orderedIds.join() === columnIds(previous, newStatus).join()
    ) {
      return;
    }

    this._optimistic = { source: this.model, data: next };
    let statusSaved = false;
    try {
      if (statusChanged) {
        await this.auth.fetchJson(`/leads/${lead.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
        statusSaved = true;
      }
      await this.auth.fetchJson('/leads/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, orderedIds }),
      });

      if (statusChanged) {
        this.notifications.success(`Lead moved to ${newStatus}`);
      }
      this.router.refresh('leads');
    } catch (e) {
      this._optimistic = null;
      this.notifications.error(e.message);
      if (statusSaved) this.router.refresh('leads');
    }
  }

  // Moving onto a card inside the column also fires dragleave; only a real exit clears.
  @action clearDropTarget(key, event) {
    if (event?.currentTarget?.contains(event.relatedTarget)) return;
    this[key] = null;
  }

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

  // Sentinel, not null: Unassigned column's id is null, so null would falsely mark it active.
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
    if (!this.editLead && !this.contactSelection.isPresent) {
      this.errorMsg = CONTACT_REQUIRED_ERROR;
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editLead;
    const path = isEdit ? `/leads/${this.editLead.id}` : '/leads';

    try {
      const originalLocalityId =
        this.editLead?.locality?.id ?? this.editLead?.localityId ?? '';
      const originalUnitId = this.editLead?.unitId ?? '';
      const originalRegionCode = this.editLead?.regionCode ?? '';

      const json = await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          // Edit must omit identity fields (name/phone/email) or forbidNonWhitelisted 400s.
          ...(isEdit
            ? {}
            : this.contactSelection.contactId
              ? {
                  contactId: this.contactSelection.contactId,
                  ...this.contactSelection.verifyPhoneField(
                    'contactVerifyPhone',
                  ),
                }
              : this.contactSelection.cleanIdentity),
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
      if (!isEdit && json?.data?.contactAccess === 'PENDING') {
        this.notifications.info('Access pending: an approver has been asked');
      }
      this.closeModal();
      this.router.refresh('leads');
    } catch (e) {
      this.errorMsg = this.contactSelection.takeConflict(e)
        ? 'Contact already added'
        : e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
