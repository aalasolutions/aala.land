import Controller from '@ember/controller';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { initialsOf } from 'land/utils/initials';

const VISIBLE_AGENT_ROWS = 6;
const VISIBLE_IDLE_AVATARS = 8;

function stageWord(stage) {
  return String(stage).toLowerCase();
}

export default class DashboardController extends Controller {
  @service region;

  get loadFailed() {
    return (this.model?.failed ?? []).length > 0;
  }

  get regionLabel() {
    return this.region.activeRegion?.name ?? 'All Regions';
  }

  get revenuePoints() {
    return (this.model?.revenueTrend ?? []).map((point) => ({
      month: point.month,
      value: Number(point.total) || 0,
    }));
  }

  get occupancyRate() {
    const kpis = this.model?.kpis;
    if (!kpis || !kpis.rentalUnits) return 0;
    return Math.round(((kpis.occupiedUnits || 0) / kpis.rentalUnits) * 100);
  }

  get pipelineStages() {
    return this.model?.ownership?.pipeline ?? [];
  }

  get maxPipelineCount() {
    return Math.max(...this.pipelineStages.map((s) => s.count), 1);
  }

  get closedWon() {
    return this.model?.ownership?.won ?? 0;
  }

  get closedLost() {
    return this.model?.ownership?.lost ?? 0;
  }

  get closedText() {
    const parts = [];
    if (this.closedWon > 0) parts.push(`${this.closedWon} won`);
    if (this.closedLost > 0) parts.push(`${this.closedLost} lost`);
    return parts.length ? parts.join(' · ') : 'None in the last 30 days';
  }

  get closedSegments() {
    const stages = [
      { stage: 'WON', count: this.closedWon },
      { stage: 'LOST', count: this.closedLost },
    ].filter((stage) => stage.count > 0);

    return this.buildSegments(stages);
  }

  computeBarWidth = (count) => {
    return Math.max(Math.round((count / this.maxPipelineCount) * 100), 2);
  };

  buildBarStyle = (count) => {
    return htmlSafe(`--bar-width:${this.computeBarWidth(count)}%;`);
  };

  // Open stages are ordinal, so they ramp one hue; outcomes keep their own colours.
  resolveStageColor = (stage) => {
    const colors = {
      NEW: 'stage-new',
      CONTACTED: 'stage-contacted',
      VIEWING: 'stage-viewing',
      NEGOTIATING: 'stage-negotiating',
      WON: 'success',
      LOST: 'danger',
    };
    return colors[stage] || 'primary';
  };

  get ownershipAgents() {
    return this.model?.ownership?.agents ?? [];
  }

  get unassignedOpen() {
    return this.model?.ownership?.unassignedOpen ?? 0;
  }

  // Assignment split comes off the census, not the agent rows, so it counts every open lead.
  get openLeadTotal() {
    return this.pipelineStages.reduce((sum, stage) => sum + stage.count, 0);
  }

  get assignedOpen() {
    return Math.max(this.openLeadTotal - this.unassignedOpen, 0);
  }

  get assignmentText() {
    if (!this.openLeadTotal) return 'No open leads';
    return `${this.assignedOpen} assigned · ${this.unassignedOpen} unassigned`;
  }

  get assignmentSegments() {
    const stages = [
      { stage: 'ASSIGNED', count: this.assignedOpen, variant: 'primary' },
      { stage: 'UNASSIGNED', count: this.unassignedOpen, variant: 'warning' },
    ].filter((stage) => stage.count > 0);

    return this.buildSegments(stages);
  }

  // Idle means no counted lead at all: someone who only closed deals still gets a row.
  countLeads = (agent) => {
    return (agent.openTotal || 0) + (agent.won || 0) + (agent.lost || 0);
  };

  get loadedAgents() {
    return this.ownershipAgents.filter((agent) => this.countLeads(agent) > 0);
  }

  get idleAgents() {
    return this.ownershipAgents
      .filter((agent) => this.countLeads(agent) === 0)
      .map((agent) => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        initials: initialsOf(agent.agentName),
      }));
  }

  get idleLabel() {
    const count = this.idleAgents.length;
    const names = this.visibleIdleAgents
      .map((agent) => agent.agentName)
      .join(', ');
    const rest = this.hiddenIdleCount
      ? ` and ${this.hiddenIdleCount} more`
      : '';
    return `${count} ${count === 1 ? 'agent' : 'agents'} with no leads: ${names}${rest}`;
  }

  get visibleIdleAgents() {
    return this.idleAgents.slice(0, VISIBLE_IDLE_AVATARS);
  }

  get hiddenIdleCount() {
    return Math.max(this.idleAgents.length - VISIBLE_IDLE_AVATARS, 0);
  }

  get hiddenAgentCount() {
    return Math.max(this.loadedAgents.length - VISIBLE_AGENT_ROWS, 0);
  }

  // Every counted lead of an agent becomes a segment.
  buildAgentStages = (agent) => {
    return [
      ...(agent.stages || []),
      { stage: 'WON', count: agent.won },
      { stage: 'LOST', count: agent.lost },
    ].filter((stage) => stage.count > 0);
  };

  // Each bar fills its own track, so a segment is a share of that row's own total.
  buildSegments = (stages) => {
    const total = stages.reduce((sum, stage) => sum + stage.count, 0) || 1;

    return stages.map((stage) => ({
      stage: stage.stage,
      count: stage.count,
      variant: stage.variant ?? this.resolveStageColor(stage.stage),
      tooltip: `${stage.count} ${stageWord(stage.stage)}`,
      style: htmlSafe(
        `--seg-width:${((stage.count / total) * 100).toFixed(2)}%;`,
      ),
    }));
  };

  get agentRows() {
    return this.loadedAgents.slice(0, VISIBLE_AGENT_ROWS).map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      initials: initialsOf(agent.agentName),
      openTotal: agent.openTotal,
      label: this.buildAgentLabel(agent),
      segments: this.buildSegments(this.buildAgentStages(agent)),
    }));
  }

  // Colour alone cannot carry the breakdown, so the row states it for assistive tech.
  buildAgentLabel = (agent) => {
    const parts = [`${agent.agentName}, ${agent.openTotal} open leads`];

    for (const stage of agent.stages || []) {
      if (stage.count > 0)
        parts.push(`${stage.count} ${stageWord(stage.stage)}`);
    }

    const closed = [];
    if (agent.won > 0) closed.push(`${agent.won} won`);
    if (agent.lost > 0) closed.push(`${agent.lost} lost`);
    if (closed.length) parts.push(`${closed.join(', ')} in the last 30 days`);

    return parts.join(', ');
  };
}
