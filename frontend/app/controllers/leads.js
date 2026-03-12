import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const PIPELINE_STAGES = [
  { status: 'NEW', label: 'New' },
  { status: 'CONTACTED', label: 'Contacted' },
  { status: 'VIEWING', label: 'Viewing' },
  { status: 'NEGOTIATING', label: 'Negotiating' },
  { status: 'WON', label: 'Won' },
  { status: 'LOST', label: 'Lost' },
];

const TEMPERATURE_STAGES = [
  { temperature: 'HOT', label: 'Hot', icon: 'fire' },
  { temperature: 'WARM', label: 'Warm', icon: 'sun' },
  { temperature: 'COLD', label: 'Cold', icon: 'snowflake' },
  { temperature: 'DEAD', label: 'Dead', icon: 'skull' },
];

const TEMPERATURE_COLORS = {
  HOT: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  WARM: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  COLD: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  DEAD: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
};

export default class LeadsController extends Controller {
  @service auth;
  @service notifications;
  @service router;
  @service region;

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
  @tracked formPropertyId = '';
  @tracked formUnitId = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked properties = [];
  @tracked filteredUnits = [];

  @tracked viewMode = 'pipeline';

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
      return leads.filter((l) => l.assignedTo && l.assignedTo !== currentUserId);
    } else if (this.filterType === 'unassigned') {
      return leads.filter((l) => !l.assignedTo);
    }
    return leads;
  }

  get columns() {
    return PIPELINE_STAGES.map((stage) => ({
      ...stage,
      leads: this.filteredLeads.filter((l) => l.status === stage.status),
    }));
  }

  get temperatureColumns() {
    return TEMPERATURE_STAGES.map((stage) => ({
      ...stage,
      leads: this.filteredLeads.filter((l) => l.temperature === stage.temperature),
    }));
  }

  get agentColumns() {
    const leads = this.filteredLeads;
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
    if (mode === 'agent' && this.agents.length === 0) {
      this.loadAgents();
    }
  }

  getTemperatureColor(temp) {
    return TEMPERATURE_COLORS[temp] || TEMPERATURE_COLORS.WARM;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action setPropertyId(e) {
    this.formPropertyId = e.target.value;
    this.formUnitId = '';
    this.filteredUnits = [];
    if (e.target.value) {
      this.loadUnits(e.target.value);
    }
  }

  @action openCreate() {
    this.formFirstName = '';
    this.formLastName = '';
    this.formEmail = '';
    this.formPhone = '';
    this.formStatus = 'NEW';
    this.formTemperature = 'WARM';
    this.formPropertyId = '';
    this.formUnitId = '';
    this.formRegionCode = this.region.regionCode;
    this.filteredUnits = [];
    this.editLead = null;
    this.errorMsg = '';
    this.showModal = true;
    this.loadProperties();
  }

  @action openEdit(lead) {
    this.formFirstName = lead.firstName ?? '';
    this.formLastName = lead.lastName ?? '';
    this.formEmail = lead.email ?? '';
    this.formPhone = lead.phone ?? '';
    this.formStatus = lead.status ?? 'NEW';
    this.formTemperature = lead.temperature ?? 'WARM';
    this.formPropertyId = lead.propertyId ?? '';
    this.formUnitId = lead.unitId ?? '';
    this.editLead = lead;
    this.errorMsg = '';
    this.showModal = true;
    this.loadProperties();
    if (lead.propertyId) {
      this.loadUnits(lead.propertyId);
    }
  }

  @action openAssignModal(lead) {
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

  @action async loadProperties() {
    try {
      const json = await this.auth.fetchJson('/properties/areas');
      this.properties = json.data?.data || [];
    } catch (e) {
      console.error('Failed to load properties:', e);
    }
  }

  @action async loadUnits(propertyId) {
    try {
      const json = await this.auth.fetchJson(`/properties/areas/${propertyId}/buildings`);
      const buildings = json.data?.data || [];
      this.filteredUnits = buildings.flatMap(b => b.units || []);
    } catch (e) {
      console.error('Failed to load units:', e);
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

      this.notifications.success(`Lead temperature changed to ${newTemperature}`);
      this.router.refresh('leads');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.draggedLead = null;
      this.dropTargetTemp = null;
    }
  }

  // Agent Board drag-drop
  @action handleAgentDragOver(agentId, event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    this.dropTargetAgent = agentId;
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
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          firstName: this.formFirstName,
          ...(this.formLastName ? { lastName: this.formLastName } : {}),
          ...(this.formEmail ? { email: this.formEmail } : {}),
          ...(this.formPhone ? { phone: this.formPhone } : {}),
          status: this.formStatus,
          temperature: this.formTemperature,
          ...(this.formPropertyId ? { propertyId: this.formPropertyId } : {}),
          ...(this.formUnitId ? { unitId: this.formUnitId } : {}),
          ...(!isEdit && this.formRegionCode ? { regionCode: this.formRegionCode } : {}),
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
